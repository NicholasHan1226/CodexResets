import { describe, expect, it } from 'vitest';
import { probabilityWithin } from '../src/lib/forecast-model';
import { FORECAST_INPUT_VERSION } from '../src/lib/reset-data';
import { getForecastCalibrationFromStore, recordForecastSnapshotInStore } from '../worker/src/forecast';
import { ForecastLedger } from '../worker/src/forecast-ledger';
import type { ResetRecordRow } from '../worker/src/types';

const DAY = 86_400_000;
const AT = Date.parse('2026-08-20T00:00:00Z');
const sample = { inputVersion: FORECAST_INPUT_VERSION, at: AT, dueAt: AT + 2 * DAY, model: 'logistic', prob24h: 0.6, prob48h: 0.8 };
const evaluation = { ...sample, resetIn24h: false, resetIn48h: false };
function storeWith(initial: Record<string, string> = {}) {
  const cache = { ...initial };
  const store = { get: async (key: string) => cache[key] ?? null, put: async (key: string, value: string) => { cache[key] = value; } };
  return { cache, store };
}
function reset(hours: number, extra: Partial<ResetRecordRow> = {}): ResetRecordRow {
  return { id: 'late', reset_date: new Date(AT + hours * 3_600_000).toISOString(), verified: true, automated: true, auto_state: 'confirmed', source_url: null, description: null, ...extra };
}

describe('forecast review regressions', () => {
  it('keeps a two-day logistic history stable at long waits and tiny horizons', () => {
    const history = [0, 2, 4, 6].map((days, index) => ({ id: String(index), date: '', timestamp: AT - days * DAY, verified: true, reason: '' }));
    const probabilities = [20, 25, 100, 1_000_000].map((days) => probabilityWithin(history, 'logistic', AT + days * DAY, 24));
    expect(probabilities.every((p) => Number.isFinite(p) && p > 0.52)).toBe(true);
    expect(probabilities[3]).toBeCloseTo(1 - Math.exp(-0.75), 12);
    expect(probabilities.every((p, i) => i === 0 || p >= probabilities[i - 1])).toBe(true);
    expect(probabilityWithin(history, 'logistic', AT + 100 * DAY, 48)).toBeGreaterThan(probabilities[2]);
    expect(probabilityWithin(history, 'logistic', AT + 100 * DAY, 0)).toBe(0);
    expect(probabilityWithin(history, 'logistic', AT + 100 * DAY, 0.000_001)).toBeGreaterThan(0);
  });

  it.each([[24, true, true], [25, false, true], [48, false, true], [49, false, false]] as const)(
    'corrects settled outcomes for a confirmed reset at hour %i while preserving prediction', async (hours, resetIn24h, resetIn48h) => {
      const { cache, store } = storeWith({ 'forecast:evaluations': JSON.stringify([evaluation]) });
      await recordForecastSnapshotInStore(store, [reset(hours)], AT + 3 * DAY);
      expect(JSON.parse(cache['forecast:evaluations'])).toEqual([{ ...evaluation, resetIn24h, resetIn48h }]);
      const calibration = await getForecastCalibrationFromStore(store);
      expect(calibration.brier24h).toBeCloseTo((0.6 - Number(resetIn24h)) ** 2);
      expect(calibration.brier48h).toBeCloseTo((0.8 - Number(resetIn48h)) ** 2);
      await recordForecastSnapshotInStore(store, [], AT + 4 * DAY);
      expect(JSON.parse(cache['forecast:evaluations'])).toEqual([{ ...evaluation, resetIn24h, resetIn48h }]);
    },
  );

  it('retains legacy and manual-history exclusions without manufacturing recovered hits', async () => {
    const { cache, store } = storeWith({ 'forecast:evaluations': JSON.stringify([{ ...evaluation, inputVersion: 'legacy' }, evaluation]) });
    await recordForecastSnapshotInStore(store, [reset(12, { automated: false, auto_state: 'manual', created_at: new Date(AT + 3 * DAY).toISOString() })], AT + 3 * DAY);
    expect(JSON.parse(cache['forecast:evaluations'])).toEqual([{ ...evaluation, inputVersion: 'legacy', historyIncomplete: true }, { ...evaluation, historyIncomplete: true }]);
    expect((await getForecastCalibrationFromStore(store)).samples).toBe(0);
  });

  it('defers outcomes until overlapping observed resets are confirmed or retracted', async () => {
    const { cache, store } = storeWith({ 'forecast:pending': JSON.stringify([sample]) });
    await recordForecastSnapshotInStore(store, [reset(12, { verified: false, auto_state: 'observed' })], AT + 3 * DAY);
    expect(JSON.parse(cache['forecast:evaluations'])).toEqual([]);
    expect(JSON.parse(cache['forecast:pending'])).toEqual([sample]);
    await recordForecastSnapshotInStore(store, [reset(12)], AT + 3 * DAY + 60_000);
    expect(JSON.parse(cache['forecast:evaluations'])).toEqual([{ ...evaluation, resetIn24h: true, resetIn48h: true }]);
    expect(JSON.parse(cache['forecast:pending'])).toEqual([]);
  });

  it('carries degraded source health through the durable ledger and settles after recovery', async () => {
    const { cache, store } = storeWith({ 'forecast:pending': JSON.stringify([sample]) });
    const ledger = new ForecastLedger({ storage: store } as unknown as DurableObjectState);
    const record = (observationHealthy: boolean, rows: ResetRecordRow[]) => ledger.fetch(new Request('https://forecast-ledger/record', {
      method: 'POST', body: JSON.stringify({ now: AT + 3 * DAY, rows, observationHealthy }),
    }));
    expect((await record(false, [])).status).toBe(200);
    expect(JSON.parse(cache['forecast:evaluations'])).toEqual([]);
    expect(JSON.parse(cache['forecast:pending'])).toEqual([sample]);
    expect((await record(true, [reset(12, { verified: false, auto_state: 'retracted' })])).status).toBe(200);
    expect(JSON.parse(cache['forecast:evaluations'])).toEqual([evaluation]);
  });
});
