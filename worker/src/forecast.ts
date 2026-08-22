import { probabilityWithin, selectForecastModel } from '../../src/lib/forecast-model';
import type { ResetRecord } from '../../src/types/reset';
import type { Env, ResetRecordRow } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const FORECAST_TTL_SECONDS = 120 * 24 * 60 * 60;
const FORECAST_PENDING_KEY = 'forecast:pending';
const FORECAST_EVALUATIONS_KEY = 'forecast:evaluations';
const FORECAST_SAMPLE_DAY_KEY = 'forecast:sample-day';

interface ForecastSample {
  at: number;
  dueAt: number;
  model: 'logistic' | 'weibull';
  prob24h: number;
  prob48h: number;
}

interface ForecastEvaluation extends ForecastSample {
  resetIn24h: boolean;
  resetIn48h: boolean;
}

export interface ForecastCalibration {
  samples: number;
  brier24h: number | null;
  brier48h: number | null;
  modelCounts: Record<'logistic' | 'weibull', number>;
  latest: Pick<ForecastSample, 'at' | 'model' | 'prob24h' | 'prob48h'> | null;
  /** Private sample gate: never changes public UI copy or the delivery path. */
  stage: 'collecting' | 'provisional' | 'calibrated' | 'established';
  nextReviewAt: 7 | 14 | 30 | null;
  recentBrier: number | null;
  previousBrier: number | null;
  trend: 'unknown' | 'stable' | 'improving' | 'degrading';
}

function toForecastRecords(records: ResetRecordRow[]): ResetRecord[] {
  return records
    .filter((record) => record.verified && record.auto_state !== 'retracted')
    .flatMap((record) => {
      const timestamp = Date.parse(record.reset_date);
      if (!Number.isFinite(timestamp)) return [];
      return [{
        id: record.id,
        date: new Date(timestamp).toISOString().slice(0, 10),
        timestamp,
        reason: record.description || 'verified reset',
        source: record.source_url || undefined,
        verified: true,
      }];
    });
}

function parseSamples(raw: string | null): ForecastSample[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((sample): sample is ForecastSample => Boolean(sample) && typeof sample === 'object' && typeof (sample as ForecastSample).at === 'number')
      : [];
  } catch {
    return [];
  }
}

function parseSample(raw: string | null): ForecastSample | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ForecastSample>;
    return typeof parsed.at === 'number'
      && typeof parsed.dueAt === 'number'
      && (parsed.model === 'logistic' || parsed.model === 'weibull')
      && typeof parsed.prob24h === 'number'
      && typeof parsed.prob48h === 'number'
      ? parsed as ForecastSample
      : null;
  } catch {
    return null;
  }
}

function parseEvaluations(raw: string | null): ForecastEvaluation[] {
  return parseSamples(raw).filter((sample): sample is ForecastEvaluation => (
    typeof (sample as Partial<ForecastEvaluation>).resetIn24h === 'boolean'
      && typeof (sample as Partial<ForecastEvaluation>).resetIn48h === 'boolean'
  ));
}

function hasResetBetween(records: ResetRecord[], start: number, end: number): boolean {
  return records.some((record) => record.timestamp > start && record.timestamp <= end);
}

/**
 * Retains one non-PII forecast per UTC day and resolves it once its 48-hour
 * horizon is known. The visitor UI never reads this data; it is durable model
 * evidence for calibration and release decisions.
 */
export async function recordForecastSnapshot(env: Env, rows: ResetRecordRow[], now = Date.now()): Promise<void> {
  const records = toForecastRecords(rows);
  if (records.length < 4) return;

  const selection = selectForecastModel(records);
  const snapshot: ForecastSample = {
    at: now,
    dueAt: now + 48 * 60 * 60 * 1000,
    model: selection.model,
    prob24h: probabilityWithin(records, selection.model, now, 24, false),
    prob48h: probabilityWithin(records, selection.model, now, 48, false),
  };

  const pending = parseSamples(await env.CACHE.get(FORECAST_PENDING_KEY));
  const due = pending.filter((sample) => sample.dueAt <= now);
  const remaining = pending.filter((sample) => sample.dueAt > now);
  if (due.length > 0) {
    const previous = parseEvaluations(await env.CACHE.get(FORECAST_EVALUATIONS_KEY));
    const evaluations = [
      ...previous,
      ...due.map((sample) => ({
        ...sample,
        resetIn24h: hasResetBetween(records, sample.at, sample.at + DAY_MS),
        resetIn48h: hasResetBetween(records, sample.at, sample.dueAt),
      })),
    ].slice(-180);
    await env.CACHE.put(FORECAST_EVALUATIONS_KEY, JSON.stringify(evaluations), { expirationTtl: FORECAST_TTL_SECONDS });
  }

  const day = new Date(now).toISOString().slice(0, 10);
  if (await env.CACHE.get(FORECAST_SAMPLE_DAY_KEY) !== day) {
    remaining.push(snapshot);
    await env.CACHE.put(FORECAST_SAMPLE_DAY_KEY, day, { expirationTtl: FORECAST_TTL_SECONDS });
  }
  await env.CACHE.put(FORECAST_PENDING_KEY, JSON.stringify(remaining), { expirationTtl: FORECAST_TTL_SECONDS });
  await env.CACHE.put('forecast:latest', JSON.stringify(snapshot), { expirationTtl: FORECAST_TTL_SECONDS });
}

/** Protected operational readback; never included in public product APIs. */
export async function getForecastCalibration(env: Env): Promise<ForecastCalibration> {
  const [evaluationsRaw, latestRaw] = await Promise.all([
    env.CACHE.get(FORECAST_EVALUATIONS_KEY),
    env.CACHE.get('forecast:latest'),
  ]);
  const evaluations = parseEvaluations(evaluationsRaw);
  const modelCounts: ForecastCalibration['modelCounts'] = { logistic: 0, weibull: 0 };
  let error24 = 0;
  let error48 = 0;
  for (const evaluation of evaluations) {
    modelCounts[evaluation.model] += 1;
    error24 += (evaluation.prob24h - Number(evaluation.resetIn24h)) ** 2;
    error48 += (evaluation.prob48h - Number(evaluation.resetIn48h)) ** 2;
  }
  const latest = parseSample(latestRaw);
  const recentBrier = meanCombinedBrier(evaluations.slice(-7));
  const previousBrier = evaluations.length >= 14 ? meanCombinedBrier(evaluations.slice(-14, -7)) : null;
  const trend = previousBrier === null || recentBrier === null
    ? 'unknown'
    : recentBrier <= previousBrier - 0.05
      ? 'improving'
      : recentBrier >= previousBrier + 0.05
        ? 'degrading'
        : 'stable';
  return {
    samples: evaluations.length,
    brier24h: evaluations.length > 0 ? error24 / evaluations.length : null,
    brier48h: evaluations.length > 0 ? error48 / evaluations.length : null,
    modelCounts,
    latest: latest && {
      at: latest.at,
      model: latest.model,
      prob24h: latest.prob24h,
      prob48h: latest.prob48h,
    },
    stage: calibrationStage(evaluations.length),
    nextReviewAt: nextReviewAt(evaluations.length),
    recentBrier,
    previousBrier,
    trend,
  };
}

function meanCombinedBrier(evaluations: ForecastEvaluation[]): number | null {
  if (evaluations.length === 0) return null;
  const total = evaluations.reduce((sum, evaluation) => (
    sum
      + (evaluation.prob24h - Number(evaluation.resetIn24h)) ** 2
      + (evaluation.prob48h - Number(evaluation.resetIn48h)) ** 2
  ), 0);
  return total / (evaluations.length * 2);
}

function calibrationStage(samples: number): ForecastCalibration['stage'] {
  if (samples < 7) return 'collecting';
  if (samples < 14) return 'provisional';
  if (samples < 30) return 'calibrated';
  return 'established';
}

function nextReviewAt(samples: number): ForecastCalibration['nextReviewAt'] {
  if (samples < 7) return 7;
  if (samples < 14) return 14;
  if (samples < 30) return 30;
  return null;
}
