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
    const previous = parseSamples(await env.CACHE.get(FORECAST_EVALUATIONS_KEY)) as ForecastEvaluation[];
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
