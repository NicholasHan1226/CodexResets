import { describe, expect, it } from 'vitest';
import { buildShareSummary } from '@/lib/export-share';

const state = { pct: 22, hours: 24 as const, daysSince: 1.6, medianDays: 2.6 };

describe('share summary', () => {
  it('keeps English as the default share language', () => {
    expect(buildShareSummary(state)).toContain('22% in 24h');
  });

  it('uses the active Chinese locale for a Chinese dashboard share', () => {
    expect(buildShareSummary(state, 'zh')).toBe(
      'Codex 重置预判 ❯ 未来 24 小时 22%\n██░░░░░░░░ 22% · 已等待 1.6 天 · 中位间隔 2.6 天',
    );
  });
});
