import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlertStatusBadge, EmailConfirmationPending, ResetAlertsPanel } from '@/sections/ResetAlertsPanel';
import { HeroSection } from '@/sections/HeroSection';
import { ProbabilityCurve } from '@/sections/ProbabilityCurve';
import { TimeDistribution } from '@/sections/TimeDistribution';
import { setDynamicResetHistory } from '@/lib/reset-data';
import { t, type Locale } from '@/lib/i18n';
import type { ResetPrediction } from '@/types/reset';

let locale: Locale = 'en';
vi.mock('@/contexts/I18nContext', () => ({
  useI18n: () => ({ locale, t: (key: string, params?: Record<string, string | number>) => t(locale, key, params) }),
}));
const now = Date.parse('2026-09-05T00:00:00Z');
const hour = 3_600_000;
const curve = [3, 6, 9, 12, 15, 18, 21, 24].map((h) => ({
  timestamp: now + h * hour, date: '2026-09-05', hour: h % 24, probability: h === 6 ? 0.3 : 0.02,
}));
function history(count: number) {
  setDynamicResetHistory(Array.from({ length: count }, (_, i) => ({
    id: String(i), timestamp: now - (i + 1) * 72 * hour, date: '2026-09-02', reason: '', verified: true,
  })));
}
afterEach(() => { setDynamicResetHistory(null); vi.useRealTimers(); locale = 'en'; });

describe('reviewed visitor claims', () => {
  it.each(['en', 'zh'] as const)('distinguishes pending email from active push in %s', (language) => {
    locale = language;
    const pending = renderToStaticMarkup(<AlertStatusBadge emailPending pushSubscribed={false} />);
    expect(pending).toContain(t(locale, 'subscribe.awaitingConfirmation'));
    expect(pending).not.toContain(t(locale, 'subscribe.armed'));
    expect(renderToStaticMarkup(<AlertStatusBadge emailPending pushSubscribed />)).toContain(t(locale, 'subscribe.armed'));
    expect(renderToStaticMarkup(<AlertStatusBadge emailPending={false} pushSubscribed={false} />)).toContain(t(locale, 'subscribe.standby'));
  });

  it.each(['en', 'zh'] as const)('explains each email type and the separate push scope in %s', (language) => {
    locale = language;
    const html = renderToStaticMarkup(<ResetAlertsPanel />);
    for (const kind of ['forecast', 'scheduled', 'confirmed']) {
      expect(html).toContain(t(locale, `subscribe.${kind}Title`));
      expect(html).toContain(t(locale, `subscribe.${kind}Detail`));
    }
    expect(html).toContain(t(locale, 'push.description'));
    expect(html).toContain(t(locale, 'subscribe.emailNote'));
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('aria-describedby="reset-alert-email-help"');
    expect(html).not.toContain('type="checkbox"');
  });

  it.each(['en', 'zh'] as const)('keeps pending confirmation actionable and honest in %s', (language) => {
    locale = language;
    const html = renderToStaticMarkup(<EmailConfirmationPending onRetry={() => {}} />);
    expect(html).toContain(t(locale, 'subscribe.confirmationSent'));
    expect(html).toContain(t(locale, 'subscribe.pendingHelp'));
    expect(html).toContain(t(locale, 'subscribe.tryAnother'));
    expect(html).toContain('role="status"');
    expect(html).not.toContain(t(locale, 'subscribe.success'));
  });

  it.each([0, 5])('suppresses a precise peak target with %s verified observations', (count) => {
    vi.useFakeTimers(); vi.setSystemTime(now); history(count);
    const html = renderToStaticMarkup(<ProbabilityCurve curve={curve} hours={24} planningProbability={0.47} />);
    expect(html).toContain(t(locale, 'curve.sparseTiming'));
    expect(html).not.toContain('History-based model peak:');
    expect(html).toContain('Total in next 24h: 47%');
  });

  it('preserves direct official timing even when history is sparse', () => {
    vi.useFakeTimers(); vi.setSystemTime(now); history(5);
    const html = renderToStaticMarkup(<ProbabilityCurve curve={curve} hours={24} officialScheduleAt={now + 6 * hour} />);
    expect(html).toContain('Official target:');
    expect(html).not.toContain(t(locale, 'curve.sparseTiming'));
  });

  it('labels the observed concentration as history and handles empty history honestly', () => {
    history(5);
    expect(renderToStaticMarkup(<TimeDistribution />)).toContain('historical concentration');
    history(0);
    const html = renderToStaticMarkup(<TimeDistribution />);
    expect(html).toContain('No verified reset observations yet.');
    expect(html).not.toContain('0/0');
  });

  it('shows the actual verified sample count next to the main probability', () => {
    history(5);
    const prediction: ResetPrediction = {
      windowStart: '', windowEnd: '', confidence: 0.4, prob24h: 0.47, prob48h: 0.73,
      curve, signals: [], lastReset: '2026-09-02T00:00:00Z', daysSinceLastReset: 3,
      medianIntervalDays: 3, advice: { 24: { level: 'cautious' }, 48: { level: 'use_freely' } }, modelVersion: '', generatedAt: now,
    };
    const html = renderToStaticMarkup(<HeroSection prediction={prediction} timeframe={24} onTimeframeChange={() => {}} primaryForecast={{ kind: 'model' }} currentTime={now} />);
    expect(html).toContain('Based on 5 verified resets.');
    expect(html).toContain('forecast accuracy is not yet validated');
  });
});
