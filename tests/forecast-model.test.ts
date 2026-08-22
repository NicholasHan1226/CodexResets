import { describe, expect, it } from 'vitest';
import { hasFreshStrongDirectSignal, probabilityWithin, scoreForecastModels, selectForecastModel } from '../src/lib/forecast-model';
import { mergeResetEpisodes } from '../src/lib/reset-episodes';
import { recordForecastSnapshot } from '../worker/src/forecast';
import type { Env, ResetRecordRow } from '../worker/src/types';
import type { ResetRecord, ResetSignal } from '../src/types/reset';

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

  it('uses only a fresh strong direct announcement to raise the near-term probability', () => {
    const history = regularHistory();
    const now = history[0].timestamp + 3 * DAY_MS;
    const baseline = probabilityWithin(history, 'logistic', now, 24, false);
    const lifted = probabilityWithin(history, 'logistic', now, 24, true);
    const strong: ResetSignal = {
      source: 'tibopost', label: 'Tibo Posting', description: 'signals.resetAnnounced',
      value: 0.9, status: 'active', updatedAt: now,
    };
    expect(lifted).toBeGreaterThan(baseline);
    expect(probabilityWithin(history, 'logistic', now + 30 * DAY_MS, 48, true)).toBeLessThanOrEqual(0.9);
    expect(hasFreshStrongDirectSignal([strong], now)).toBe(true);
    expect(hasFreshStrongDirectSignal([{ ...strong, updatedAt: now - 25 * 60 * 60 * 1000 }], now)).toBe(false);
  });

  it('records the same direct-signal lift used by the browser into private forecast evidence', async () => {
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

    const baselineStore = createEnv();
    const liftedStore = createEnv();
    await recordForecastSnapshot(baselineStore.env, rows, now, false);
    await recordForecastSnapshot(liftedStore.env, rows, now, true);
    const baseline = JSON.parse(baselineStore.cache['forecast:latest'] || '{}') as { prob24h: number };
    const lifted = JSON.parse(liftedStore.cache['forecast:latest'] || '{}') as { prob24h: number; strongDirectSignal: boolean };
    expect(lifted.strongDirectSignal).toBe(true);
    expect(lifted.prob24h).toBeGreaterThan(baseline.prob24h);
  });
});
