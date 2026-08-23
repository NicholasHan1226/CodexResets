import { describe, expect, it } from 'vitest';
import { probabilityWithin, scoreForecastModels, scoreHighConfidenceDecisions, selectForecastModel } from '../src/lib/forecast-model';
import { mergeResetEpisodes } from '../src/lib/reset-episodes';
import { MIN_CALENDAR_RECORDS, RESET_HISTORY, shouldShowResetCalendar } from '../src/lib/reset-data';
import { generatePrediction } from '../src/lib/prediction';
import { getForecastCalibration, recordForecastSnapshot } from '../worker/src/forecast';
import { ForecastLedger } from '../worker/src/forecast-ledger';
import type { Env, ResetRecordRow } from '../worker/src/types';
import type { ResetRecord } from '../src/types/reset';

const DAY_MS = 24 * 60 * 60 * 1000;

function record(id: string, timestamp: number): ResetRecord {
  return { id, date: new Date(timestamp).toISOString().slice(0, 10), timestamp, reason: 'verified reset', verified: true };
}

function regularHistory(): ResetRecord[] {
  const start = Date.parse('2026-01-01T18:00:00Z');
  return Array.from({ length: 30 }, (_, index) => record(String(index), start + index * 4 * DAY_MS)).reverse();
}

describe('reset episode forecasting', () => {
  it('shows the annual calendar only once there is enough reviewed history to make it useful', () => {
    expect(shouldShowResetCalendar(RESET_HISTORY)).toBe(false);
    const enoughHistory = Array.from({ length: MIN_CALENDAR_RECORDS }, (_, index) => record(`calendar-${index}`, Date.now() - index * DAY_MS));
    expect(shouldShowResetCalendar(enoughHistory)).toBe(true);
  });

  it('merges multiple posts from one reset into one canonical episode', () => {
    const latest = Date.parse('2026-08-11T17:00:00Z');
    const history = [record('latest', latest), record('duplicate', latest - 8 * 60 * 60 * 1000), record('prior', latest - 4 * DAY_MS)];
    const episodes = mergeResetEpisodes(history);
    expect(episodes.map((item) => item.id)).toEqual(['latest', 'prior']);
  });

  it('scores both models on time-ordered historical cutoffs before selecting one', () => {
    const scores = scoreForecastModels(regularHistory());
    expect(scores).toHaveLength(2);
    expect(scores.every((score) => score.samples >= 16 && Number.isFinite(score.brier))).toBe(true);
    expect(['logistic', 'weibull']).toContain(selectForecastModel(regularHistory()).model);
  });

  it('keeps the reviewed baseline traceable and historical regression diagnostic-only', () => {
    expect(RESET_HISTORY).not.toHaveLength(0);
    expect(RESET_HISTORY.every((record) => record.verified === true && Boolean(record.source))).toBe(true);
    const score = scoreHighConfidenceDecisions(RESET_HISTORY, 0.8);
    expect(score.threshold).toBe(0.8);
    expect(score.samples).toBeGreaterThanOrEqual(0);
    expect(score.decisions).toBeLessThanOrEqual(score.samples);
  });

  it('keeps direct announcements out of the future-facing probability model', () => {
    const history = regularHistory();
    const now = history[0].timestamp + 3 * DAY_MS;
    expect(probabilityWithin(history, 'logistic', now, 24)).toBeGreaterThan(0);
    expect(probabilityWithin(history, 'logistic', now + 30 * DAY_MS, 48)).toBeLessThanOrEqual(0.9);
  });

  it('keeps model probabilities finite, bounded, and horizon-monotonic across irregular histories', () => {
    const origin = Date.parse('2026-01-01T00:00:00Z');
    const histories = [
      regularHistory(),
      [1, 2, 7, 3, 11, 4, 6, 2].map((gap, index, gaps) => record(
        `irregular-${index}`,
        origin + gaps.slice(0, index + 1).reduce((sum, days) => sum + days, 0) * DAY_MS,
      )).reverse(),
    ];

    for (const history of histories) {
      const latest = Math.max(...history.map((event) => event.timestamp));
      for (const model of ['logistic', 'weibull'] as const) {
        for (const elapsedDays of [0, 0.25, 1, 4, 20, 90]) {
          const within24 = probabilityWithin(history, model, latest + elapsedDays * DAY_MS, 24);
          const within48 = probabilityWithin(history, model, latest + elapsedDays * DAY_MS, 48);
          expect(within24).toBeGreaterThanOrEqual(0);
          expect(within24).toBeLessThanOrEqual(0.9);
          expect(within48).toBeGreaterThanOrEqual(within24);
          expect(within48).toBeLessThanOrEqual(0.9);
          expect(Number.isFinite(within24)).toBe(true);
          expect(Number.isFinite(within48)).toBe(true);
        }
      }
    }
  });

  it('keeps the displayed 24h and 48h totals consistent with the probability curve', () => {
    const prediction = generatePrediction(regularHistory());
    const probabilityIn = (hours: number) => prediction.curve
      .slice(0, hours / 3)
      .reduce((sum, point) => sum + point.probability, 0);

    // Curve points are rounded to 0.1 percentage points, so permit only the
    // tiny aggregate rounding error that can appear across 16 buckets.
    expect(Math.abs(probabilityIn(24) - prediction.prob24h)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(probabilityIn(48) - prediction.prob48h)).toBeLessThanOrEqual(0.02);
  });

  it('records a history-only production forecast snapshot', async () => {
    const createEnv = () => {
      const cache: Record<string, string> = {};
      return {
        cache,
        env: {
          CACHE: {
            get: async (key: string) => cache[key] ?? null,
            put: async (key: string, value: string) => { cache[key] = value; },
          },
        } as unknown as Env,
      };
    };
    const now = Date.parse('2026-08-20T00:00:00Z');
    const rows: ResetRecordRow[] = Array.from({ length: 6 }, (_, index) => ({
      id: `reset-${index}`,
      reset_date: new Date(now - (index + 1) * 4 * DAY_MS).toISOString(),
      source_url: null,
      description: 'verified reset',
      verified: true,
      auto_state: 'confirmed',
    }));

    const store = createEnv();
    await recordForecastSnapshot(store.env, rows, now);
    const snapshot = JSON.parse(store.cache['forecast:latest'] || '{}') as { prob24h: number; strongDirectSignal?: boolean };
    expect(snapshot.prob24h).toBeGreaterThan(0);
    expect(snapshot.strongDirectSignal).toBeUndefined();
  });

  it('starts future-only production scoring with a sparse live database', async () => {
    const cache: Record<string, string> = {};
    const env = {
      CACHE: {
        get: async (key: string) => cache[key] ?? null,
        put: async (key: string, value: string) => { cache[key] = value; },
      },
    } as unknown as Env;
    const now = Date.parse('2026-08-20T00:00:00Z');
    const rows: ResetRecordRow[] = [{
      id: 'live-reset',
      reset_date: new Date(now - 2 * DAY_MS).toISOString(),
      source_url: null,
      description: 'verified reset',
      verified: true,
      auto_state: 'confirmed',
    }];

    await recordForecastSnapshot(env, rows, now);
    expect(JSON.parse(cache['forecast:pending'] || '[]')).toHaveLength(1);

    await recordForecastSnapshot(env, rows, now + 49 * 60 * 60 * 1000);
    expect(JSON.parse(cache['forecast:evaluations'] || '[]')).toEqual([
      expect.objectContaining({ resetIn24h: false, resetIn48h: false }),
    ]);
  });

  it('keeps forecast evidence in one private durable ledger', async () => {
    const cache: Record<string, string> = {};
    const ledger = new ForecastLedger({
      storage: {
        get: async (key: string) => cache[key],
        put: async (key: string, value: string) => { cache[key] = value; },
      },
    } as unknown as DurableObjectState);
    const now = Date.parse('2026-08-20T00:00:00Z');
    const rows: ResetRecordRow[] = Array.from({ length: 6 }, (_, index) => ({
      id: `ledger-reset-${index}`,
      reset_date: new Date(now - (index + 1) * 4 * DAY_MS).toISOString(),
      source_url: null,
      description: null,
      verified: true,
      auto_state: 'confirmed',
    }));
    const record = async (at: number, inputRows = rows) => ledger.fetch(new Request('https://forecast-ledger/record', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ now: at, rows: inputRows.map(({ id, reset_date, verified, auto_state }) => ({ id, reset_date, verified, auto_state })) }),
    }));

    expect((await record(now)).status).toBe(200);
    expect((await record(now + 49 * 60 * 60 * 1000)).status).toBe(200);
    const calibration = await (await ledger.fetch(new Request('https://forecast-ledger/calibration'))).json() as { samples: number };
    expect(calibration.samples).toBe(1);
    expect(JSON.parse(cache['forecast:evaluations'] || '[]')).toHaveLength(1);
  });

  it('migrates an already-pending future sample into the durable ledger once', async () => {
    const cache: Record<string, string> = {};
    const ledger = new ForecastLedger({
      storage: {
        get: async (key: string) => cache[key],
        put: async (key: string, value: string) => { cache[key] = value; },
      },
    } as unknown as DurableObjectState);
    const now = Date.parse('2026-08-20T00:00:00Z');
    const rows: ResetRecordRow[] = Array.from({ length: 6 }, (_, index) => ({
      id: `legacy-reset-${index}`,
      reset_date: new Date(now - (index + 1) * 4 * DAY_MS).toISOString(),
      source_url: null,
      description: null,
      verified: true,
      auto_state: 'confirmed',
    }));
    const sample = { at: now, dueAt: now + 48 * 60 * 60 * 1000, model: 'weibull', prob24h: 0.1, prob48h: 0.1 };
    const body = (at: number, legacy?: object) => JSON.stringify({
      now: at,
      legacy,
      rows: rows.map(({ id, reset_date, verified, auto_state }) => ({ id, reset_date, verified, auto_state })),
    });
    const legacy = {
      pending: JSON.stringify([sample]),
      evaluations: null,
      sampleDay: '2026-08-20',
      latest: JSON.stringify(sample),
    };

    expect((await ledger.fetch(new Request('https://forecast-ledger/record', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: body(now, legacy),
    }))).status).toBe(200);
    expect(JSON.parse(cache['forecast:pending'] || '[]')).toHaveLength(1);
    expect((await ledger.fetch(new Request('https://forecast-ledger/record', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: body(now + 49 * 60 * 60 * 1000),
    }))).status).toBe(200);
    expect(JSON.parse(cache['forecast:evaluations'] || '[]')).toEqual([
      expect.objectContaining({ at: now, resetIn48h: false }),
    ]);
  });

  it('excludes direct-announcement samples from formal future-accuracy scoring', async () => {
    const cache: Record<string, string> = {
      'forecast:evaluations': JSON.stringify([
        {
          at: Date.parse('2026-08-20T00:00:00Z'), dueAt: Date.parse('2026-08-22T00:00:00Z'),
          model: 'weibull', prob24h: 0.9, prob48h: 0.9, strongDirectSignal: true,
          resetIn24h: false, resetIn48h: false,
        },
        {
          at: Date.parse('2026-08-21T00:00:00Z'), dueAt: Date.parse('2026-08-23T00:00:00Z'),
          model: 'weibull', prob24h: 0.1, prob48h: 0.1,
          resetIn24h: false, resetIn48h: false,
        },
      ]),
    };
    const env = {
      CACHE: {
        get: async (key: string) => cache[key] ?? null,
        put: async (key: string, value: string) => { cache[key] = value; },
      },
    } as unknown as Env;

    const calibration = await getForecastCalibration(env);
    expect(calibration).toMatchObject({
      samples: 1,
      decisionAccuracy48h: {
        decisions: 1,
        correct: 1,
        positivePredictions: 0,
        status: 'collecting',
      },
    });
    expect(calibration.brier24h).toBeCloseTo(0.01);
    expect(calibration.brier48h).toBeCloseTo(0.01);
  });
});
