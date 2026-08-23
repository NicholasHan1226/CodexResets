import type { DeliveryMetrics, Env, ResetRecordRow, RunReport } from './types';
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
import { buildSignalsSnapshot, getStatusEvidence } from './signals';
import { notifyAll, sendCalibrationAlert, sendHealthAlert } from './notify';
import { FORECAST_RELEASE_STATUS_KEY, getForecastCalibration, recordForecastSnapshot, type ForecastCalibration } from './forecast';
import { refreshOfficialCodexDiscovery } from './discovery';
import { recordSubscriptionMetric } from './operational-metrics';

const HOUR = 3600 * 1000;
// Seed with the newest bundled reset so the snapshot works before the DB
// has any rows (and if the DB is ever unreachable).
const SEED_RESET_TS = Date.parse('2026-08-13T01:01:00Z');
const FALLBACK_MEDIAN_DAYS = 3.8;
const HEALTH_ALERT_COOLDOWN_SECONDS = 6 * 60 * 60;
const HEALTH_ALERT_KEY = 'health:alert:last_sent';
const AUTOMATION_STABILIZATION_MS = 30 * 60 * 1000;
const RETRACTION_WINDOW_MS = 72 * HOUR;
const DIRECT_SOURCE_FAILURE_KEY = 'direct-source:consecutive-failures';
const DIRECT_SOURCE_FAILURE_TTL_SECONDS = 3 * 24 * 60 * 60;
const DIRECT_SOURCE_FAILURE_ALERT_AT = 3;
const DELIVERY_METRIC_TTL_SECONDS = 31 * 24 * 60 * 60;
const FORECAST_CALIBRATION_ALERT_TTL_SECONDS = 120 * 24 * 60 * 60;
const FORECAST_RELEASE_STATUS_TTL_SECONDS = 2 * 60 * 60;

/**
 * Route every trigger through one globally addressed Durable Object. This
 * prevents a cron tick, a signed webhook and a manual recovery run from
 * reading the same row and delivering it twice.
 */
export async function runPipeline(env: Env, trigger: string): Promise<RunReport> {
  const id = env.PIPELINE_COORDINATOR.idFromName('global');
  const response = await env.PIPELINE_COORDINATOR.get(id).fetch('https://pipeline-coordinator/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trigger }),
  });
  if (!response.ok) throw new Error(`pipeline coordinator ${response.status}`);
  return await response.json() as RunReport;
}

/** The serialized pipeline body; only PipelineCoordinator may invoke this in production. */
export async function runPipelineOnce(env: Env, trigger: string): Promise<RunReport> {
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
  // Secondary official discovery is deliberately isolated from candidate and
  // alert flows. A changelog page can provide context, never confirmation.
  await refreshOfficialCodexDiscovery(env);
  await applyDirectSourceGate(env, scrape, report);
  const statusEvidence = await getStatusEvidence();
  report.statusGate = statusEvidence.state === 'incident' ? 'hold' : statusEvidence.state;

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
  if (scrape.sourceKind === 'direct' && hasPrivilegedAccess(env) && statusEvidence.state !== 'incident') {
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
  } else if (scrape.sourceKind === 'direct' && statusEvidence.state === 'incident') {
    report.autoHeldByStatus = allRecords.filter(
      (record) => record.automated && !record.verified && record.auto_state === 'observed' && Date.parse(record.auto_confirm_after || '') <= Date.now(),
    ).length;
  }

  // 5. Deliver automatically confirmed resets. The earlier migration marked
  // pre-existing confirmed rows as delivered, preventing a historical replay.
  const records = allRecords.filter((record) => record.verified);
  try {
    await recordForecastSnapshot(env, records, Date.now());
    const calibration = await getForecastCalibration(env);
    await env.CACHE.put(
      FORECAST_RELEASE_STATUS_KEY,
      calibration.decisionAccuracy48h.status === 'passed' ? '1' : '0',
      { expirationTtl: FORECAST_RELEASE_STATUS_TTL_SECONDS },
    );
    await maybeSendCalibrationAlert(env, calibration);
  } catch (err) {
    report.errors.push(`forecast snapshot: ${err instanceof Error ? err.message : String(err)}`);
    await env.CACHE.put(FORECAST_RELEASE_STATUS_KEY, '0', { expirationTtl: FORECAST_RELEASE_STATUS_TTL_SECONDS }).catch(() => {});
  }
  for (const record of records.filter((row) => !row.notified_at)) {
    const outcome = await notifyAll(env, {
      ts: new Date(record.reset_date).getTime(),
      link: record.source_url || '',
      text: record.description || 'A confirmed Codex usage reset was recorded.',
    });
    report.notifiedEmails += outcome.emails;
    report.notifiedPush += outcome.pushes;
    report.prunedPushEndpoints = (report.prunedPushEndpoints || 0) + outcome.prunedPushEndpoints;
    if (outcome.prunedPushEndpoints > 0) {
      await recordSubscriptionMetric(env, 'push_pruned_after_delivery', outcome.prunedPushEndpoints).catch(() => {});
    }
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
  const snapshot = await buildSignalsSnapshot(env, scrape, latestResetTs, medianGapDays, statusEvidence);
  snapshot.sources.database = records.length > 0 ? 'live' : 'fallback';
  await env.CACHE.put('signals:latest', JSON.stringify(snapshot), { expirationTtl: 7 * 24 * HOUR / 1000 });

  // 7. Health report and a rate-limited operational email when the pipeline
  // cannot collect or process a healthy snapshot.
  if (shouldSendHealthAlert(report) && env.HEALTH_ALERT_EMAIL && env.RESEND_API_KEY) {
    if (!await env.CACHE.get(HEALTH_ALERT_KEY)) {
      try {
        await sendHealthAlert(env, report);
        await env.CACHE.put(HEALTH_ALERT_KEY, report.startedAt, { expirationTtl: HEALTH_ALERT_COOLDOWN_SECONDS });
      } catch (err) {
        report.errors.push(`health alert: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  try {
    await updateDeliveryMetrics(env, report);
  } catch (err) {
    report.errors.push(`metrics: ${err instanceof Error ? err.message : String(err)}`);
  }
  await env.CACHE.put('health:last_run', JSON.stringify(report));
  return report;
}

/**
 * Review only meaningful sample milestones (7, 14, 30), plus a later
 * measurable degradation. This is deliberately an ops notice, not a source
 * of live prediction or notification behavior.
 */
async function maybeSendCalibrationAlert(env: Env, calibration: ForecastCalibration): Promise<void> {
  if (!env.HEALTH_ALERT_EMAIL || !env.RESEND_API_KEY) return;
  const milestone = calibration.samples === 7 || calibration.samples === 14 || calibration.samples === 30;
  const degradation = calibration.samples >= 14 && calibration.trend === 'degrading';
  if (!milestone && !degradation) return;
  const key = `forecast:calibration-alert:${milestone ? `sample-${calibration.samples}` : 'degrading'}`;
  if (await env.CACHE.get(key)) return;
  await sendCalibrationAlert(env, calibration);
  await env.CACHE.put(key, calibration.stage, { expirationTtl: FORECAST_CALIBRATION_ALERT_TTL_SECONDS });
}

/**
 * A single upstream mirror miss is observable through /api/health but does
 * not page the operator. Other processing failures still alert immediately;
 * a direct-source outage alerts after the existing three-run confirmation
 * gate, when automation remains paused.
 */
export function shouldSendHealthAlert(report: RunReport): boolean {
  const hasNonScrapeFailure = report.errors.some((error) => !error.startsWith('scrape:'));
  return hasNonScrapeFailure || (report.directSourceFailures || 0) >= DIRECT_SOURCE_FAILURE_ALERT_AT;
}

async function applyDirectSourceGate(env: Env, scrape: Awaited<ReturnType<typeof scrapeTweets>>, report: RunReport): Promise<void> {
  if (scrape.sourceKind === 'direct') {
    report.directSource = 'live';
    await env.CACHE.delete(DIRECT_SOURCE_FAILURE_KEY);
    return;
  }
  report.directSource = scrape.sourceKind === 'degraded' ? 'degraded' : 'down';
  const failures = (Number(await env.CACHE.get(DIRECT_SOURCE_FAILURE_KEY)) || 0) + 1;
  report.directSourceFailures = failures;
  await env.CACHE.put(DIRECT_SOURCE_FAILURE_KEY, String(failures), { expirationTtl: DIRECT_SOURCE_FAILURE_TTL_SECONDS });
  if (failures >= DIRECT_SOURCE_FAILURE_ALERT_AT) {
    report.errors.push(`direct source unavailable for ${failures} consecutive runs; automated confirmation remains paused`);
  }
}

async function updateDeliveryMetrics(env: Env, report: RunReport): Promise<void> {
  const date = report.startedAt.slice(0, 10);
  const key = `metrics:delivery:${date}`;
  let previous: Partial<DeliveryMetrics> = {};
  const raw = await env.CACHE.get(key);
  if (raw) {
    try { previous = JSON.parse(raw) as Partial<DeliveryMetrics>; } catch { /* replace malformed metrics */ }
  }
  const next: DeliveryMetrics = {
    date,
    runs: (previous.runs || 0) + 1,
    directRuns: (previous.directRuns || 0) + (report.directSource === 'live' ? 1 : 0),
    degradedRuns: (previous.degradedRuns || 0) + (report.directSource === 'degraded' ? 1 : 0),
    failedRuns: (previous.failedRuns || 0) + (report.directSource === 'down' ? 1 : 0),
    candidates: (previous.candidates || 0) + report.candidates,
    staleCandidates: (previous.staleCandidates || 0) + (report.staleCandidates || 0),
    autoQueued: (previous.autoQueued || 0) + (report.autoQueued || 0),
    autoConfirmed: (previous.autoConfirmed || 0) + (report.autoConfirmed || 0),
    autoRetracted: (previous.autoRetracted || 0) + (report.autoRetracted || 0),
    statusHeld: (previous.statusHeld || 0) + (report.autoHeldByStatus || 0),
    emails: (previous.emails || 0) + report.notifiedEmails,
    pushes: (previous.pushes || 0) + report.notifiedPush,
    prunedPushEndpoints: (previous.prunedPushEndpoints || 0) + (report.prunedPushEndpoints || 0),
    errors: (previous.errors || 0) + report.errors.length,
  };
  await env.CACHE.put(key, JSON.stringify(next), { expirationTtl: DELIVERY_METRIC_TTL_SECONDS });
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
