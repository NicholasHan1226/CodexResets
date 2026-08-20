import { useI18n } from '@/contexts/I18nContext';
import type { ResetPrediction } from '@/types/reset';

interface HeroSectionProps {
  prediction: ResetPrediction;
  timeframe: 24 | 48;
  onTimeframeChange: (tf: 24 | 48) => void;
}

export function HeroSection({ prediction, timeframe, onTimeframeChange }: HeroSectionProps) {
  const { t, locale } = useI18n();
  const pct24 = Math.round(prediction.prob24h * 100);
  const pct48 = Math.round(prediction.prob48h * 100);
  const pct = timeframe === 24 ? pct24 : pct48;

  const lastResetDate = prediction.lastReset ? new Date(prediction.lastReset) : null;
  const daysSince = prediction.daysSinceLastReset;
  const isLikely = pct24 >= 50;

  const lastResetStr = lastResetDate
    ? lastResetDate.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'short',
        day: 'numeric',
      }) +
      ' ' +
      lastResetDate.toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '—';

  const windowStart = prediction.windowStart ? new Date(prediction.windowStart) : null;
  const windowStr = windowStart
    ? windowStart.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'short',
        day: 'numeric',
      }) +
      ' ' +
      windowStart.toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : null;

  return (
    <section aria-label="Reset probability">
      {/* Terminal prompt */}
      <p className="font-mono text-sm text-muted-foreground">
        <span className="text-primary">❯</span> will codex reset?{' '}
        <span className="text-muted-foreground/60">
          {isLikely ? t('hero.signalYes') : t('hero.signalNo')}
        </span>
      </p>

      {/* The probability — the core number */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            {t('hero.probLabel')}
          </span>
          {/* Timeframe toggle */}
          <div className="flex items-center font-mono text-sm" role="tablist" aria-label="Timeframe">
            {([24, 48] as const).map((tf) => (
              <button
                key={tf}
                role="tab"
                aria-selected={timeframe === tf}
                onClick={() => onTimeframeChange(tf)}
                className={`px-2 py-0.5 transition-colors ${
                  timeframe === tf
                    ? 'text-primary font-semibold'
                    : 'text-muted-foreground/50 hover:text-muted-foreground'
                }`}
              >
                [{tf}h]
              </button>
            ))}
          </div>
        </div>

        <div className="mt-1 flex items-baseline gap-3">
          <span className="font-mono text-6xl sm:text-7xl font-semibold tracking-tight text-primary">
            {pct}
            <span className="text-3xl sm:text-4xl text-primary/70">%</span>
          </span>
          <span className="text-sm text-muted-foreground">
            {t('hero.withinHours', { n: timeframe })}
          </span>
        </div>
      </div>

      {/* Secondary stats — one line */}
      <p className="mt-5 font-mono text-xs text-muted-foreground">
        {t('hero.lastResetLabel')}{' '}
        <span className="text-foreground">{daysSince.toFixed(1)}d</span>
        <span className="mx-2 text-border">·</span>
        {lastResetStr}
        <span className="mx-2 text-border">·</span>
        {t('hero.medianGap')}{' '}
        <span className="text-foreground">{prediction.medianIntervalDays.toFixed(1)}d</span>
        {windowStr && (
          <>
            <span className="mx-2 text-border">·</span>
            {t('hero.windowShort')}{' '}
            <span className="text-foreground">{windowStr}</span>
          </>
        )}
      </p>

      {/* Advice */}
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        <span className="text-foreground font-medium">{t('hero.adviceLabel')}</span>{' '}
        {prediction.advice.text}
      </p>
    </section>
  );
}

export default HeroSection;
