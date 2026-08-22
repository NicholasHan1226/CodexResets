import type { Env, ResetRecordRow, RunReport } from './types';
import {
  scrapeTweets,
  detectResetEvents,
  detectResetRetractions,
  isResetAnnouncement,
  isRetractionForCandidate,
  isTimelyAutomatedCandidate,
} from './scrape';
import { sbSelect } from './supabase';
import {
  hasPrivilegedAccess,
  privConfirmAutomatedReset,
  privInsertResets,
  privMarkResetNotified,
  privQueueAutomatedReset,
  privRetractAutomatedReset,
} from './privileged';
import { buildSignalsSnapshot } from './signals';
import { notifyAll, sendHealthAlert } from './notify';

const HOUR = 3600 * 1000;
// Seed with the newest bundled reset so the snapshot works before the DB
// has any rows (and if the DB is ever unreachable).
const SEED_RESET_TS = Date.parse('2026-08-13T01:01:00Z');
const FALLBACK_MEDIAN_DAYS = 3.8;
const HEALTH_ALERT_COOLDOWN_SECONDS = 6 * 60 * 60;
const HEALTH_ALERT_KEY = 'health:alert:last_sent';
const AUTOMATION_STABILIZATION_MS = 30 * 60 * 1000;
const RETRACTION_WINDOW_MS = 72 * HOUR;

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

  // 2. Discoveries go through a Worker-owned stabilization window. A direct
  // target-account source is required; news-only fallback never promotes a
  // candidate into subscriber delivery on its own.
  let allRecords: ResetRecordRow[] = [];
  try {
    allRecords = await sbSelect<ResetRecordRow>(env, 'reset_records?select=*&order=reset_date.desc&limit=100', true);
  } catch (err) {
    report.errors.push(`records read: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Detect direct-source announcements, dedupe, then start the automated
  //    stabilization window. Weak mentions and degraded-source news cannot
  //    create a reset record or trigger delivery.
  const detection = detectResetEvents(scrape.tweets);
  const strongCandidates = detection.strong;
  const candidates = strongCandidates.filter((candidate) => isTimelyAutomatedCandidate(candidate));
  report.candidates = candidates.length;
  report.staleCandidates = strongCandidates.length - candidates.length;
  report.weakCandidates = detection.weak.length;
  report.candidateSamples = [
    ...detection.strong.map((c) => ({ tier: 'strong' as const, ts: new Date(c.ts).toISOString(), link: c.link, text: c.text.slice(0, 160) })),
    ...detection.weak.map((c) => ({ tier: 'weak' as const, ts: new Date(c.ts).toISOString(), link: c.link, text: c.text.slice(0, 160) })),
  ].slice(0, 4);
  const fresh = candidates.filter(
    (c) =>
      !allRecords.some(
        (r) =>
          (r.source_url && r.source_url === c.link) ||
          Math.abs(new Date(r.reset_date).getTime() - c.ts) < 6 * HOUR
      )
  );

  if (fresh.length > 0 && scrape.sourceKind === 'direct') {
    if (!hasPrivilegedAccess(env)) {
      report.errors.push('insert skipped: no privileged DB access (service role key)');
    } else {
      const rows = fresh.map((c) => ({
        reset_date: new Date(c.ts).toISOString(),
        description: c.text,
        source_url: c.link,
        verified: false,
        automated: true,
        auto_state: 'observed' as const,
        auto_confirm_after: new Date(Date.now() + AUTOMATION_STABILIZATION_MS).toISOString(),
      }));
      const res = await privInsertResets(env, rows);
      if (res.ok) {
        report.pendingInserted = rows.length;
        report.autoQueued = (report.autoQueued || 0) + rows.length;
        allRecords = [
          ...rows.map((r, i) => ({ id: `new-${i}`, ...r })),
          ...allRecords,
        ];
      } else {
        report.errors.push(`insert: ${res.status} ${await res.text()}`);
      }
    }
  }

  // 4. Automatically enroll older pending discoveries, retract any that have
  //    a later source correction, and confirm stable ones. This replaces the
  //    manual database toggle while retaining a reversible pre-delivery state.
  if (scrape.sourceKind === 'direct' && hasPrivilegedAccess(env)) {
    const now = Date.now();
    for (const record of allRecords) {
      if (record.verified || record.auto_state === 'retracted') continue;
      if (!record.automated || !record.auto_confirm_after) {
        if (!record.source_url || !record.description || !isResetAnnouncement(record.description)) continue;
        const createdAt = Date.parse(record.created_at || record.reset_date);
        const confirmAfter = new Date(Math.max(now, createdAt + AUTOMATION_STABILIZATION_MS)).toISOString();
        const queued = await privQueueAutomatedReset(env, record.id, confirmAfter);
        if (!queued.ok) {
          report.errors.push(`automation queue: ${queued.status} ${await queued.text()}`);
          continue;
        }
        record.automated = true;
        record.auto_state = 'observed';
        record.auto_confirm_after = confirmAfter;
        report.autoQueued = (report.autoQueued || 0) + 1;
      }
    }

    const retractions = detectResetRetractions(scrape.tweets);
    for (const record of allRecords) {
      if (!record.automated || record.verified || record.auto_state !== 'observed') continue;
      const recordedAt = Date.parse(record.reset_date);
      const candidate = { ts: recordedAt, text: record.description || '', link: record.source_url || '' };
      const retracted = retractions.some(
        (event) => event.ts >= recordedAt && event.ts - recordedAt <= RETRACTION_WINDOW_MS && isRetractionForCandidate(candidate, event)
      );
      if (!retracted) continue;
      const result = await privRetractAutomatedReset(env, record.id);
      if (!result.ok) {
        report.errors.push(`automation retract: ${result.status} ${await result.text()}`);
        continue;
      }
      record.auto_state = 'retracted';
      record.retracted_at = new Date().toISOString();
      report.autoRetracted = (report.autoRetracted || 0) + 1;
    }

    for (const record of allRecords) {
      if (!record.automated || record.verified || record.auto_state !== 'observed') continue;
      if (Date.parse(record.auto_confirm_after || '') > now) continue;
      const confirmed = await privConfirmAutomatedReset(env, record.id);
      if (!confirmed.ok) {
        report.errors.push(`automation confirm: ${confirmed.status} ${await confirmed.text()}`);
        continue;
      }
      record.verified = true;
      record.auto_state = 'confirmed';
      record.auto_confirm_after = null;
      report.autoConfirmed = (report.autoConfirmed || 0) + 1;
    }
  }

  // 5. Deliver automatically confirmed resets. The earlier migration marked
  // pre-existing confirmed rows as delivered, preventing a historical replay.
  const records = allRecords.filter((record) => record.verified);
  for (const record of records.filter((row) => !row.notified_at)) {
    const outcome = await notifyAll(env, {
      ts: new Date(record.reset_date).getTime(),
      link: record.source_url || '',
      text: record.description || 'A confirmed Codex usage reset was recorded.',
    });
    report.notifiedEmails += outcome.emails;
    report.notifiedPush += outcome.pushes;
    report.errors.push(...outcome.errors);
    if (outcome.errors.length === 0) {
      const marked = await privMarkResetNotified(env, record.id);
      if (!marked.ok) report.errors.push(`notification mark: ${marked.status} ${await marked.text()}`);
    }
  }

  // 6. Signals snapshot → KV (the browser reads this instead of scraping)
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

  // 7. Health report and a rate-limited operational email when the pipeline
  // cannot collect or process a healthy snapshot.
  if ((report.scrape === 'failed' || report.errors.length > 0) && env.HEALTH_ALERT_EMAIL && env.RESEND_API_KEY) {
    if (!await env.CACHE.get(HEALTH_ALERT_KEY)) {
      try {
        await sendHealthAlert(env, report);
        await env.CACHE.put(HEALTH_ALERT_KEY, report.startedAt, { expirationTtl: HEALTH_ALERT_COOLDOWN_SECONDS });
      } catch (err) {
        report.errors.push(`health alert: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

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
