import { describe, expect, it } from 'vitest';
import { getPrimaryForecast } from '@/lib/forecast-display';
import type { ResetSignal } from '@/types/reset';

const now = Date.parse('2026-08-24T00:00:00.000Z');
const scheduledSignal: ResetSignal = {
  source: 'tibopost', label: 'Tibo Posting', status: 'active', value: 0.8,
  description: 'signals.resetScheduled', updatedAt: now,
  scheduledAt: now + 30 * 60 * 60 * 1000,
};

describe('primary forecast display', () => {
  it('does not present a history-only probability when an official target is after 24h', () => {
    expect(getPrimaryForecast([scheduledSignal], 24, now)).toEqual({
      kind: 'official-schedule', scheduledAt: scheduledSignal.scheduledAt, window: 'after',
    });
  });

  it('uses the official target inside the 48h answer window', () => {
    expect(getPrimaryForecast([scheduledSignal], 48, now)).toEqual({
      kind: 'official-schedule', scheduledAt: scheduledSignal.scheduledAt, window: 'within',
    });
  });

  it('falls back to the calibrated model only without an active official schedule', () => {
    expect(getPrimaryForecast([], 24, now)).toEqual({ kind: 'model' });
  });
});
