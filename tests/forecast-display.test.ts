import { describe, expect, it } from 'vitest';
import { formatOfficialScheduleCountdown, formatOfficialScheduleTarget, getPlanningProbability, getPrimaryForecast, OFFICIAL_SCHEDULE_GRACE_MS } from '@/lib/forecast-display';
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

  it('raises the planning likelihood only when an official target falls inside the selected window', () => {
    const after24h = getPrimaryForecast([scheduledSignal], 24, now);
    const within48h = getPrimaryForecast([scheduledSignal], 48, now);
    expect(getPlanningProbability(0.24, [scheduledSignal], after24h)).toBe(0.24);
    expect(getPlanningProbability(0.24, [scheduledSignal], within48h)).toBeCloseTo(0.848, 3);
  });

  it('keeps a just-passed official target as strong evidence during its execution grace period', () => {
    const graceSignal = { ...scheduledSignal, description: 'signals.resetScheduleElapsed', scheduledAt: now - 2 * 60 * 60 * 1000 } as const;
    const grace = getPrimaryForecast([graceSignal], 24, now);
    expect(grace).toEqual({ kind: 'official-schedule', scheduledAt: graceSignal.scheduledAt, window: 'grace' });
    expect(getPlanningProbability(0.24, [graceSignal], grace)).toBeCloseTo(0.848, 3);
  });

  it('does not retain an official boost beyond the execution grace period', () => {
    const elapsed = getPrimaryForecast([{ ...scheduledSignal, scheduledAt: now - OFFICIAL_SCHEDULE_GRACE_MS - 60_000 }], 24, now);
    expect(getPlanningProbability(0.24, [scheduledSignal], elapsed)).toBe(0.24);
  });

  it('falls back to the calibrated model only without an active official schedule', () => {
    expect(getPrimaryForecast([], 24, now)).toEqual({ kind: 'model' });
  });

  it('does not claim that an official schedule belongs to a window when its time is unknown', () => {
    expect(getPrimaryForecast([{ ...scheduledSignal, scheduledAt: undefined }], 24, now)).toEqual({
      kind: 'official-schedule', scheduledAt: null, window: 'pending',
    });
  });

  it('does not present a passed official target as an upcoming schedule', () => {
    expect(getPrimaryForecast([{ ...scheduledSignal, scheduledAt: now - OFFICIAL_SCHEDULE_GRACE_MS - 60_000 }], 24, now)).toEqual({
      kind: 'official-schedule', scheduledAt: now - OFFICIAL_SCHEDULE_GRACE_MS - 60_000, window: 'elapsed',
    });
  });

  it('formats an official target in the visitor timezone without exposing a source URL', () => {
    expect(formatOfficialScheduleTarget(Date.parse('2026-08-23T22:00:00.000Z'), 'zh')).toMatch(/\d{2}:\d{2}/);
  });

  it('anchors a future official target to the current visitor time', () => {
    expect(formatOfficialScheduleCountdown(now + 4 * 60 * 60 * 1000 + 20 * 60 * 1000, now, 'zh')).toBe('距现在约 4小时20分钟');
    expect(formatOfficialScheduleCountdown(now + 4 * 60 * 60 * 1000 + 20 * 60 * 1000, now, 'en')).toBe('~4h 20m from now');
    expect(formatOfficialScheduleCountdown(now - 2 * 60 * 60 * 1000, now, 'zh')).toBeNull();
    expect(formatOfficialScheduleCountdown(now - OFFICIAL_SCHEDULE_GRACE_MS - 1, now, 'zh')).toBeNull();
  });
});
