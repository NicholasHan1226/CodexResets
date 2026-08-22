import { describe, expect, it } from 'vitest';
import { probabilityWithin, scoreForecastModels, scoreHighConfidenceDecisions, selectForecastModel } from '../src/lib/forecast-model';
import { mergeResetEpisodes } from '../src/lib/reset-episodes';
import { RESET_HISTORY } from '../src/lib/reset-data';
import { getForecastCalibration, recordForecastSnapshot } from '../worker/src/forecast';
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

  it('keeps the formal 80% target honest in a leakage-free historical regression', () => {
    const score = scoreHighConfidenceDecisions(RESET_HISTORY, 0.8);
    expect(score).toMatchObject({
      threshold: 0.8,
      samples: 138,
      decisions: 60,
      positivePredictions: 20,
      accuracy: expect.any(Number),
      positivePrecision: expect.any(Number),
    });
    expect(score.accuracy).toBeGreaterThanOrEqual(0.8);
    expect(score.positivePrecision).toBeGreaterThanOrEqual(0.8);
    expect(score.modelCounts).toEqual({ logistic: 13, weibull: 125 });
  });

  it('keeps direct announcements out of the future-facing probability model', () => {
    const history = regularHistory();
    const now = history[0].timestamp + 3 * DAY_MS;
    expect(probabilityWithin(history, 'logistic', now, 24)).toBeGreaterThan(0);
    expect(probabilityWithin(history, 'logistic', now + 30 * DAY_MS, 48)).toBeLessThanOrEqual(0.9);
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
