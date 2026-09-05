import { pathToFileURL } from 'node:url';

const HOST = 'codexresets.cc';
const LIMIT = 1000;
const DAY = 86_400_000;

export function trafficQuery(accountId, start, end, dimension = 'siteTag bot') {
  if (!/^[a-f0-9]{32}$/.test(accountId)) throw new Error('Invalid Cloudflare account ID');
  if (!['siteTag bot', 'refererHost bot', 'requestPath bot', 'deviceType bot'].includes(dimension)) {
    throw new Error('Unsupported traffic dimension');
  }
  const from = new Date(start).toISOString();
  const to = new Date(end).toISOString();
  if (from >= to) throw new Error('Traffic window must have a positive duration');
  return `{viewer {accounts(filter: {accountTag:"${accountId}"}) {
    rumPageloadEventsAdaptiveGroups(limit:${LIMIT}, filter:{requestHost:"${HOST}",datetime_geq:"${from}",datetime_lt:"${to}"}) {
      count avg {sampleInterval} sum {visits} dimensions {${dimension}}
    }
  }}}`;
}

export function summarizeTraffic(response) {
  if (response.errors?.length) throw new Error('Cloudflare analytics query failed; no totals reported');
  const accounts = response.data?.viewer?.accounts;
  if (!Array.isArray(accounts) || accounts.length !== 1) throw new Error('Analytics account data unavailable');
  const rows = accounts[0].rumPageloadEventsAdaptiveGroups;
  if (!Array.isArray(rows) || rows.length >= LIMIT) throw new Error('Analytics result unavailable or truncated');
  const report = { pageViews: 0, nonBotPageViews: 0, nonBotVisits: 0, botPageViews: 0, sampled: false, maxSampleInterval: 1, rows };
  for (const row of rows) {
    if (![row.count, row.sum?.visits, row.avg?.sampleInterval].every(Number.isFinite)
      || row.count < 0 || row.sum.visits < 0 || row.avg.sampleInterval < 1
      || ![0, 1].includes(row.dimensions?.bot)) throw new Error('Invalid analytics row; no totals reported');
    // Adaptive counts are already extrapolated by Cloudflare. Never multiply again.
    report.pageViews += row.count;
    if (row.dimensions.bot === 0) {
      report.nonBotPageViews += row.count;
      report.nonBotVisits += row.sum.visits;
    } else report.botPageViews += row.count;
    report.maxSampleInterval = Math.max(report.maxSampleInterval, row.avg.sampleInterval);
  }
  report.sampled = report.maxSampleInterval > 1;
  return report;
}

export async function readTrafficReport({ token, accountId, end = new Date(), fetchImpl = fetch }) {
  if (!token || !accountId) throw new Error('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID for read-only analytics');
  const until = new Date(end).getTime();
  if (!Number.isFinite(until)) throw new Error('Invalid report end time');
  const specs = [
    ['last24Hours', until - DAY, until, 'siteTag bot'],
    ['last7Days', until - 7 * DAY, until, 'siteTag bot'],
    ['previous7Days', until - 14 * DAY, until - 7 * DAY, 'siteTag bot'],
    ['sources7Days', until - 7 * DAY, until, 'refererHost bot'],
    ['pages7Days', until - 7 * DAY, until, 'requestPath bot'],
    ['devices7Days', until - 7 * DAY, until, 'deviceType bot'],
  ];
  const windows = {};
  for (const [name, start, stop, dimension] of specs) {
    const query = trafficQuery(accountId, start, stop, dimension);
    const response = await fetchImpl('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }), signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Analytics HTTP ${response.status}; no totals reported`);
    windows[name] = { start: new Date(start).toISOString(), end: new Date(stop).toISOString(), ...summarizeTraffic(await response.json()) };
  }
  return {
    generatedAt: new Date().toISOString(), host: HOST,
    source: 'Cloudflare rumPageloadEventsAdaptiveGroups',
    caveats: [
      'Visits are not unique people. Non-bot means not flagged by Cloudflare, not verified human.',
      'Internal tests cannot be removed retrospectively; block the RUM beacon during future browser QA.',
      'Only the production hostname is included. Preview hosts and API request counts are excluded.',
      'Sampled windows are estimates; compare siteTag coverage before interpreting changes.',
      'Missing referrers do not prove direct entry. No cohort or subscriber identity is inferred.',
    ], windows,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  readTrafficReport({ token: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, end: process.env.REPORT_END || new Date() })
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch(() => { console.error('Traffic report failed. Check analytics credentials, time range and API availability; no partial totals were published.'); process.exitCode = 1; });
}
