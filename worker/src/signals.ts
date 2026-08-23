import type { Env, PublicResetHistory, ScrapeResult, SignalSnapshot, SignalsPayload } from './types';
import { readJsonWithin } from './util';
import { RESET_RE, CONTEXT_RE, isResetAnnouncement } from './scrape';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

interface StatusIncident {
  status: string;
  resolved_at: string | null;
  name: string;
}

export interface StatusEvidence {
  state: 'clear' | 'incident' | 'unavailable';
  incidentCount: number;
}

/**
 * Build the four-signal snapshot server-side, mirroring the frontend model.
 * The browser reads this payload via /api/signals instead of attempting
 * fragile client-side scraping itself.
 */
export async function buildSignalsSnapshot(
  env: Env,
  scrape: ScrapeResult,
  latestResetTs: number,
  medianGapDays: number,
  history: PublicResetHistory[],
  statusEvidence?: StatusEvidence,
): Promise<SignalsPayload> {
  const now = Date.now();
  const daysSince = (now - latestResetTs) / DAY;
  const cooldownRatio = medianGapDays > 0 ? daysSince / medianGapDays : 0;

  const [tibo, statusPage] = await Promise.all([
    Promise.resolve(buildTiboSignal(scrape, now)),
    buildStatusSignal(now, statusEvidence),
  ]);

  const cooldown: SignalSnapshot = {
    source: 'cooldown',
    label: 'Time Cooldown',
    status: cooldownRatio >= 1.2 ? 'active' : cooldownRatio >= 0.7 ? 'weak' : 'idle',
    value: Math.min(1, cooldownRatio),
    description: 'signals.cooldownDesc',
    descriptionParams: {
      d: daysSince.toFixed(1),
      m: medianGapDays.toFixed(1),
    },
    updatedAt: now,
  };

  const launchValue = cooldownRatio >= 0.8 ? Math.min(0.4, 0.22 + (cooldownRatio - 0.8) * 0.4) : 0.08;
  const launch: SignalSnapshot = {
    source: 'launch_noise',
    label: 'Launch Noise',
    status: launchValue >= 0.3 ? 'active' : launchValue >= 0.15 ? 'weak' : 'idle',
    value: launchValue,
    description: launchValue >= 0.15 ? 'signals.launchActive' : 'signals.launchQuiet',
    updatedAt: now,
  };

  return {
    signals: [tibo, statusPage, cooldown, launch],
    generatedAt: now,
    history,
    sources: {
      // A reachable mirror is still useful discovery context, but it is not
      // an authoritative account feed and must not be labelled as live.
      tweets: scrape.sourceKind === 'direct' ? 'live' : scrape.ok ? 'stale' : 'down',
      statusPage: statusPage.description === 'signals.statusDown' ? 'down' : 'live',
      database: 'live',
    },
  };
}

function buildTiboSignal(scrape: ScrapeResult, now: number): SignalSnapshot {
  const base = {
    source: 'tibopost',
    label: 'Tibo Posting',
    updatedAt: now,
    sourceUrl: 'https://x.com/thsottiaux',
  };

  // RSS/Nitter/news results may be stale, altered, or about a different
  // account. They remain useful to the Worker as discovery input but cannot
  // make a visitor-facing reset claim. Only authenticated X API results are
  // direct enough to lift this signal.
  if (scrape.ok && scrape.sourceKind === 'degraded') {
    return {
      ...base,
      status: 'idle',
      value: 0.1,
      description: 'signals.noHints',
    };
  }

  if (!scrape.ok || scrape.tweets.length === 0) {
    return {
      ...base,
      status: 'idle',
      value: 0.1,
      description: 'signals.tiboUnavailable',
    };
  }

  const latest = scrape.tweets[0];
  // Same filters as the event detector: a reset mention needs the usage-limit
  // context word; the ACTIVE tier additionally needs announcement phrasing.
  const latestResetTweet = scrape.tweets.find((t) => RESET_RE.test(t.text) && CONTEXT_RE.test(t.text));
  const hoursSinceResetMention = latestResetTweet ? Math.floor((now - latestResetTweet.ts) / HOUR) : null;

  if (
    hoursSinceResetMention !== null &&
    hoursSinceResetMention < 24 &&
    latestResetTweet &&
    isResetAnnouncement(latestResetTweet.text)
  ) {
    return {
      ...base,
      status: 'active',
      value: 0.9,
      description: 'signals.resetAnnounced',
      descriptionParams: { n: hoursSinceResetMention },
    };
  }
  if (hoursSinceResetMention !== null && hoursSinceResetMention < 24 * 7) {
    return {
      ...base,
      status: 'weak',
      value: 0.4,
      description: 'signals.resetMentionedDays',
      descriptionParams: { n: Math.floor(hoursSinceResetMention / 24) },
    };
  }

  const hoursSincePost = Math.floor((now - latest.ts) / HOUR);
  if (hoursSincePost < 24) {
    return { ...base, status: 'weak', value: 0.2, description: 'signals.activeToday' };
  }
  return {
    ...base,
    status: 'idle',
    value: 0.08,
    description: 'signals.lastPostDays',
    descriptionParams: { n: Math.floor(hoursSincePost / 24) },
  };
}

async function buildStatusSignal(now: number, evidence?: StatusEvidence): Promise<SignalSnapshot> {
  const base = {
    source: 'status_page',
    label: 'OpenAI Status',
    updatedAt: now,
    sourceUrl: 'https://status.openai.com/history',
  };
  const current = evidence || await getStatusEvidence();
  if (current.state === 'incident') {
    return {
      ...base,
      status: 'active',
      value: 0.6,
      description: 'signals.statusActiveIncidents',
      descriptionParams: { n: current.incidentCount },
    };
  }
  if (current.state === 'clear') return { ...base, status: 'idle', value: 0.08, description: 'signals.statusClear' };
  return { ...base, status: 'idle', value: 0.05, description: 'signals.statusDown' };
}

/** Independent official status evidence. It can block a risky confirmation, never create one. */
export async function getStatusEvidence(): Promise<StatusEvidence> {
  try {
    const res = await fetch('https://status.openai.com/api/v2/incidents.json', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await readJsonWithin<{ incidents?: StatusIncident[] }>(res, 64 * 1024);
    if (!data) throw new Error('invalid or oversized status response');
    const KEYWORDS = ['codex', 'rate limit', 'usage limit', 'quota'];
    const active = (data.incidents || []).filter(
      (i) => i.status !== 'resolved' && !i.resolved_at && KEYWORDS.some((k) => i.name.toLowerCase().includes(k))
    );
    return active.length > 0
      ? { state: 'incident', incidentCount: active.length }
      : { state: 'clear', incidentCount: 0 };
  } catch {
    return { state: 'unavailable', incidentCount: 0 };
  }
}
