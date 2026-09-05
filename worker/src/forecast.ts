import { probabilityWithin, selectForecastModel } from '../../src/lib/forecast-model';
import { FORECAST_INPUT_VERSION, RESET_HISTORY } from '../../src/lib/reset-data';
import { mergeResetEpisodes } from '../../src/lib/reset-episodes';
import type { ResetRecord } from '../../src/types/reset';
import type { Env, ResetRecordRow } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const FORECAST_TTL_SECONDS = 120 * 24 * 60 * 60;
const FORECAST_PENDING_KEY = 'forecast:pending';
const FORECAST_EVALUATIONS_KEY = 'forecast:evaluations';
const FORECAST_SAMPLE_DAY_KEY = 'forecast:sample-day';
const FORECAST_LATEST_KEY = 'forecast:latest';
/** Coarse public release gate; private calibration details never leave the admin route. */
export const FORECAST_RELEASE_STATUS_KEY = 'forecast:release-ready';

export interface ForecastStore {
  get(key: string): Promise<string | null | undefined>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface LegacyForecastState {
  pending: string | null;
  evaluations: string | null;
  sampleDay: string | null;
  latest: string | null;
}

interface ForecastSample {
  inputVersion?: string;
  at: number;
  dueAt: number;
  model: 'logistic' | 'weibull';
  prob24h: number;
  prob48h: number;
  /** Retained only to exclude legacy samples created before the forward-only model. */
  strongDirectSignal?: boolean;
  /** Retain the original score but exclude decisions affected by late history. */
  historyIncomplete?: boolean;
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
  /**
   * Formal-release accuracy gate. A high-confidence 48h decision must be
   * either >=80% or <=20%; positive precision is tracked separately so a
   * no-reset majority cannot manufacture an 80% score.
   */
  decisionAccuracy48h: ForecastDecisionAccuracy;
}

export interface ForecastDecisionAccuracy {
  threshold: 0.8;
  target: 0.8;
  decisions: number;
  correct: number;
  accuracy: number | null;
  positivePredictions: number;
  positiveCorrect: number;
  positivePrecision: number | null;
  status: 'collecting' | 'passed' | 'below_target';
}

function toForecastRecords(records: ResetRecordRow[], now: number): ResetRecord[] {
  return records
    .filter((record) => record.verified && record.auto_state !== 'retracted')
    .flatMap((record) => {
      const timestamp = Date.parse(record.reset_date);
      // Forecasts are forward-looking. A malformed or manually entered
      // future row must never become information the model had "already"
      // seen when this snapshot was made.
      if (!Number.isFinite(timestamp) || timestamp > now) return [];
      return [{
        id: record.id,
        date: new Date(timestamp).toISOString().slice(0, 10),
        timestamp,
        reason: 'verified reset',
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
 * Model and outcomes use verified production observations only. The legacy
 * bundled seed is quarantined; it cannot fill missing observations.
 */
function recordsForModel(observedRecords: ResetRecord[], now: number): ResetRecord[] {
  const baseline = RESET_HISTORY.filter((record) => record.timestamp <= now);
  return mergeResetEpisodes([...observedRecords, ...baseline]);
}

/**
 * Retains one non-PII forecast per UTC day and resolves it once its 48-hour
 * horizon is known. The visitor UI never reads this data; it is durable model
 * evidence for calibration and release decisions.
 */
export async function recordForecastSnapshot(
  env: Env,
  rows: ResetRecordRow[],
  now = Date.now(),
  observationHealthy = true,
): Promise<void> {
  if (env.FORECAST_LEDGER) {
    const legacy = await readLegacyForecastState(env.CACHE);
    const response = await env.FORECAST_LEDGER.get(env.FORECAST_LEDGER.idFromName('production')).fetch('https://forecast-ledger/record', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        now,
        observationHealthy,
        legacy,
        rows: rows.map(({ id, reset_date, verified, auto_state, automated, created_at }) => ({ id, reset_date, verified, auto_state, automated, created_at })),
      }),
    });
    if (!response.ok) throw new Error(`forecast ledger ${response.status}`);
    return;
  }
  await recordForecastSnapshotInStore(env.CACHE, rows, now, observationHealthy);
}

async function readLegacyForecastState(store: ForecastStore): Promise<LegacyForecastState> {
  const [pending, evaluations, sampleDay, latest] = await Promise.all([
    store.get(FORECAST_PENDING_KEY),
    store.get(FORECAST_EVALUATIONS_KEY),
    store.get(FORECAST_SAMPLE_DAY_KEY),
    store.get(FORECAST_LATEST_KEY),
  ]);
  return {
    pending: pending ?? null,
    evaluations: evaluations ?? null,
    sampleDay: sampleDay ?? null,
    latest: latest ?? null,
  };
}

/** Internal ledger operation, exported for the Durable Object and deterministic tests. */
export async function recordForecastSnapshotInStore(
  store: ForecastStore,
  rows: ResetRecordRow[],
  now = Date.now(),
  observationHealthy = true,
): Promise<void> {
  const observedRecords = toForecastRecords(rows, now);
  const confirmedRecords = toForecastRecords(rows.filter((row) => row.automated === true
    && row.auto_state === 'confirmed'), now);
  const records = recordsForModel(observedRecords, now);
  const flagIncompleteHistory = <T extends ForecastSample>(sample: T): T => ({
    ...sample,
    ...(rows.some((row) => row.verified && row.automated === false
      && Date.parse(row.created_at || '') > sample.at
      && Date.parse(row.reset_date) <= sample.dueAt)
      ? { historyIncomplete: true } : {}),
  });
  const pending = parseSamples((await store.get(FORECAST_PENDING_KEY)) ?? null).map(flagIncompleteHistory);
  const canSettle = (sample: ForecastSample): boolean => sample.dueAt <= now && observationHealthy
    && !rows.some((row) => row.automated && !row.verified && row.auto_state === 'observed'
      && Date.parse(row.reset_date) > sample.at && Date.parse(row.reset_date) <= sample.dueAt);
  const due = pending.filter(canSettle);
  const remaining = pending.filter((sample) => !canSettle(sample)
    && sample.at >= now - FORECAST_TTL_SECONDS * 1000);
  {
    const cutoff = now - FORECAST_TTL_SECONDS * 1000;
    const previous = parseEvaluations((await store.get(FORECAST_EVALUATIONS_KEY)) ?? null)
      .filter((evaluation) => evaluation.at >= cutoff).map(flagIncompleteHistory);
    const evaluations = [
      ...previous.map((evaluation) => {
        // New automatic confirmation can arrive after settlement. Keep the
        // original prediction and only add positive evidence: the input is a
        // bounded history, so absence must never erase an established hit.
        // Recovered manual history retains its separate exclusion policy.
        return {
          ...evaluation,
          resetIn24h: evaluation.resetIn24h || hasResetBetween(confirmedRecords, evaluation.at, evaluation.at + DAY_MS),
          resetIn48h: evaluation.resetIn48h || hasResetBetween(confirmedRecords, evaluation.at, evaluation.dueAt),
        };
      }),
      ...due.map((sample) => ({
        ...sample,
        resetIn24h: hasResetBetween(observedRecords, sample.at, sample.at + DAY_MS),
        resetIn48h: hasResetBetween(observedRecords, sample.at, sample.dueAt),
      })),
    ].slice(-120);
    await store.put(FORECAST_EVALUATIONS_KEY, JSON.stringify(evaluations), { expirationTtl: FORECAST_TTL_SECONDS });
  }

  // Settle and mark existing evidence even if retraction leaves sparse history.
  if (records.length < 4) {
    await store.put(FORECAST_PENDING_KEY, JSON.stringify(remaining), { expirationTtl: FORECAST_TTL_SECONDS });
    return;
  }
  const selection = selectForecastModel(records);
  const snapshot: ForecastSample = {
    inputVersion: FORECAST_INPUT_VERSION,
    at: now,
    dueAt: now + 48 * 60 * 60 * 1000,
    model: selection.model,
    prob24h: probabilityWithin(records, selection.model, now, 24),
    prob48h: probabilityWithin(records, selection.model, now, 48),
  };
  const day = new Date(now).toISOString().slice(0, 10);
  if (await store.get(FORECAST_SAMPLE_DAY_KEY) !== day) {
    remaining.push(snapshot);
    await store.put(FORECAST_SAMPLE_DAY_KEY, day, { expirationTtl: FORECAST_TTL_SECONDS });
  }
  await store.put(FORECAST_PENDING_KEY, JSON.stringify(remaining), { expirationTtl: FORECAST_TTL_SECONDS });
  await store.put(FORECAST_LATEST_KEY, JSON.stringify(snapshot), { expirationTtl: FORECAST_TTL_SECONDS });
}

/** Protected operational readback; never included in public product APIs. */
export async function getForecastCalibration(env: Env): Promise<ForecastCalibration> {
  if (env.FORECAST_LEDGER) {
    const response = await env.FORECAST_LEDGER.get(env.FORECAST_LEDGER.idFromName('production')).fetch('https://forecast-ledger/calibration');
    if (!response.ok) throw new Error(`forecast ledger ${response.status}`);
    return await response.json() as ForecastCalibration;
  }
  return getForecastCalibrationFromStore(env.CACHE);
}

/** Internal ledger read, exported for the Durable Object and deterministic tests. */
export async function getForecastCalibrationFromStore(store: ForecastStore): Promise<ForecastCalibration> {
  const [evaluationsRaw, latestRaw] = await Promise.all([
    store.get(FORECAST_EVALUATIONS_KEY),
    store.get(FORECAST_LATEST_KEY),
  ]);
  const evaluations = calibrationEvaluations(parseEvaluations(evaluationsRaw ?? null));
  const modelCounts: ForecastCalibration['modelCounts'] = { logistic: 0, weibull: 0 };
  let error24 = 0;
  let error48 = 0;
  for (const evaluation of evaluations) {
    modelCounts[evaluation.model] += 1;
    error24 += (evaluation.prob24h - Number(evaluation.resetIn24h)) ** 2;
    error48 += (evaluation.prob48h - Number(evaluation.resetIn48h)) ** 2;
  }
  const latest = parseSample(latestRaw ?? null);
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
    decisionAccuracy48h: forecastDecisionAccuracy(evaluations),
  };
}

/**
 * A direct reset announcement is already-observed information when the
 * pipeline samples it. We retain its snapshot because it mirrors the visitor
 * model, but exclude it from forward-looking calibration and release scoring.
 * Otherwise a same-run announcement could inflate a "future" accuracy claim.
 */
function calibrationEvaluations(evaluations: ForecastEvaluation[]): ForecastEvaluation[] {
  return evaluations.filter((evaluation) => evaluation.inputVersion === FORECAST_INPUT_VERSION
    && !evaluation.strongDirectSignal && !evaluation.historyIncomplete);
}

function forecastDecisionAccuracy(evaluations: ForecastEvaluation[]): ForecastDecisionAccuracy {
  const highConfidence = evaluations.filter((evaluation) => evaluation.prob48h >= 0.8 || evaluation.prob48h <= 0.2);
  const positive = highConfidence.filter((evaluation) => evaluation.prob48h >= 0.8);
  const correct = highConfidence.filter((evaluation) => (
    evaluation.prob48h >= 0.8 ? evaluation.resetIn48h : !evaluation.resetIn48h
  ));
  const positiveCorrect = positive.filter((evaluation) => evaluation.resetIn48h);
  const accuracy = highConfidence.length > 0 ? correct.length / highConfidence.length : null;
  const positivePrecision = positive.length > 0 ? positiveCorrect.length / positive.length : null;
  const hasSufficientEvidence = highConfidence.length >= 20 && positive.length >= 5;
  const passed = hasSufficientEvidence && accuracy !== null && positivePrecision !== null && accuracy >= 0.8 && positivePrecision >= 0.8;
  return {
    threshold: 0.8,
    target: 0.8,
    decisions: highConfidence.length,
    correct: correct.length,
    accuracy,
    positivePredictions: positive.length,
    positiveCorrect: positiveCorrect.length,
    positivePrecision,
    status: !hasSufficientEvidence ? 'collecting' : passed ? 'passed' : 'below_target',
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
