import type { Env, ResetRecordRow, RunReport } from './types';
import { scrapeTweets, scrapeNewsMentions, detectResetEvents } from './scrape';
import { sbSelect, sbInsert } from './supabase';
import { buildSignalsSnapshot } from './signals';
import { notifyAll } from './notify';

const HOUR = 3600 * 1000;
// Seed with the newest bundled reset so the snapshot works before the DB
// has any rows (and if the DB is ever unreachable).
const SEED_RESET_TS = Date.parse('2026-08-13T01:01:00Z');
const FALLBACK_MEDIAN_DAYS = 3.8;

export async function runPipeline(env: Env, trigger: string): Promise<RunReport> {
  const report: RunReport = {
    startedAt: new Date().toISOString(),
    trigger,
    scrape: 'failed',
    tweetsSeen: 0,
    candidates: 0,
    inserted: 0,
    notifiedEmails: 0,
    notifiedPush: 0,
    errors: [],
  };

  // 1. Scrape tweets (RSSHub fallback chain)
  const scrape = await scrapeTweets(env);
  report.scrape = scrape.ok ? 'ok' : 'failed';
  report.scrapeInstance = scrape.instance;
  report.tweetsSeen = scrape.tweets.length;
  if (!scrape.ok && scrape.error) report.errors.push(`scrape: ${scrape.error}`);

  // 2. Load recent records (anon read — RLS allows public select)
  let records: ResetRecordRow[] = [];
  try {
    records = await sbSelect<ResetRecordRow>(env, 'reset_records?select=*&order=reset_date.desc&limit=30');
  } catch (err) {
    report.errors.push(`records read: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Detect reset candidates, dedupe against known records, insert new ones.
  //    Only strong (announcement-phrased) candidates are auto-inserted; weak
  //    mentions are logged for manual review. When every tweet mirror is
  //    down, fall back to Google News mentions.
  let detection = detectResetEvents(scrape.tweets);
  if (!scrape.ok) {
    const news = await scrapeNewsMentions();
    detection = detectResetEvents(news);
    if (news.length > 0) report.scrapeInstance = (report.scrapeInstance || '') + ' +news-fallback';
  }
  const candidates = detection.strong;
  report.candidates = candidates.length;
  report.weakCandidates = detection.weak.length;
  report.candidateSamples = [
    ...detection.strong.map((c) => ({ tier: 'strong' as const, ts: new Date(c.ts).toISOString(), link: c.link, text: c.text.slice(0, 160) })),
    ...detection.weak.map((c) => ({ tier: 'weak' as const, ts: new Date(c.ts).toISOString(), link: c.link, text: c.text.slice(0, 160) })),
  ].slice(0, 4);
  const fresh = candidates.filter(
    (c) =>
      !records.some(
        (r) =>
          (r.source_url && r.source_url === c.link) ||
          Math.abs(new Date(r.reset_date).getTime() - c.ts) < 6 * HOUR
      )
  );

  if (fresh.length > 0) {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      report.errors.push('insert skipped: SUPABASE_SERVICE_ROLE_KEY not configured');
    } else {
      const rows = fresh.map((c) => ({
        reset_date: new Date(c.ts).toISOString(),
        description: c.text,
        source_url: c.link,
        verified: false,
      }));
      const res = await sbInsert(env, 'reset_records', rows);
      if (res.ok) {
        report.inserted = rows.length;
        records = [
          ...rows.map((r, i) => ({ id: `new-${i}`, ...r })),
          ...records,
        ];
      } else {
        report.errors.push(`insert: ${res.status} ${await res.text()}`);
      }
    }
  }

  // 4. Notify subscribers about the newest newly-detected reset
  if (report.inserted > 0) {
    const newest = [...fresh].sort((a, b) => b.ts - a.ts)[0];
    const outcome = await notifyAll(env, newest);
    report.notifiedEmails = outcome.emails;
    report.notifiedPush = outcome.pushes;
    report.errors.push(...outcome.errors);
  }

  // 5. Signals snapshot → KV (the browser reads this instead of scraping)
  let latestResetTs = records.length > 0 ? new Date(records[0].reset_date).getTime() : 0;
  if (latestResetTs > 0) {
    await env.CACHE.put('latest_reset_ts', String(latestResetTs));
  } else {
    latestResetTs = Number(await env.CACHE.get('latest_reset_ts')) || SEED_RESET_TS;
  }
  const medianGapDays = computeMedianGapDays(records) ?? FALLBACK_MEDIAN_DAYS;
  const snapshot = await buildSignalsSnapshot(env, scrape, latestResetTs, medianGapDays);
  snapshot.sources.database = records.length > 0 ? 'live' : 'fallback';
  await env.CACHE.put('signals:latest', JSON.stringify(snapshot), { expirationTtl: 7 * 24 * HOUR / 1000 });

  // 6. Health report
  await env.CACHE.put('health:last_run', JSON.stringify(report));
  return report;
}

function computeMedianGapDays(records: ResetRecordRow[]): number | null {
  if (records.length < 3) return null;
  const ts = records.map((r) => new Date(r.reset_date).getTime()).sort((a, b) => b - a);
  const gaps: number[] = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const gap = (ts[i] - ts[i + 1]) / (24 * HOUR);
    if (gap > 0 && gap < 100) gaps.push(gap);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}
