import { useI18n } from '@/contexts/I18nContext';
import type { ResetPrediction } from '@/types/reset';
import { Zap, Timer, TrendingUp, CalendarClock, Lightbulb } from 'lucide-react';

interface HeroSectionProps {
  prediction: ResetPrediction;
}

export function HeroSection({ prediction }: HeroSectionProps) {
  const { t } = useI18n();
  const pct24 = Math.round(prediction.prob24h * 100);
  const pct48 = Math.round(prediction.prob48h * 100);

  const lastReset = prediction.lastReset
    ? new Date(prediction.lastReset).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';

  const windowStart = prediction.windowStart ? new Date(prediction.windowStart) : null;
  const windowEnd = prediction.windowEnd ? new Date(prediction.windowEnd) : null;
  const windowLabel = windowStart && windowEnd
    ? `${windowStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${windowStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} — ${windowEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} UTC`
    : '—';

  const advice = prediction.advice;
  const adviceBgMap: Record<string, string> = {
    use_freely: 'bg-primary/10',
    cautious: 'bg-warning/10',
    wait: 'bg-warning/10',
    critical: 'bg-destructive/10',
  };
  const adviceColorMap: Record<string, string> = {
    use_freely: 'text-primary',
    cautious: 'text-warning',
    wait: 'text-warning',
    critical: 'text-destructive',
  };
  const adviceBg = adviceBgMap[advice.level] || 'bg-primary/10';
  const adviceColor = adviceColorMap[advice.level] || 'text-primary';

  const waitPct = Math.min(100, (prediction.daysSinceLastReset / prediction.medianIntervalDays) * 100);

  return (
    <section
      className="bg-card rounded-lg shadow-card border-l-[3px] border-l-primary glow-pulse p-6 fade-in-up"
      aria-label="Reset probability hero"
    >
      <div className="flex flex-col lg:flex-row lg:items-center gap-6">
        {/* Left: 24h probability */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Zap className="w-3.5 h-3.5 text-primary" />
            {t('hero.prob24h')}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span
              className="text-5xl font-bold font-mono text-primary"
              style={{ textShadow: '0 0 28px rgba(16,163,127,0.35)' }}
            >
              {pct24}%
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-mono text-success">
              <TrendingUp className="w-3.5 h-3.5" />
              {t('hero.trend')}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t('hero.waitedPrefix')}{' '}
            <span className="font-mono text-foreground">{prediction.daysSinceLastReset.toFixed(1)} {t('hero.days')}</span>
            {t('hero.waitedSuffix')}{' '}
            <span className="font-mono text-foreground">{prediction.medianIntervalDays.toFixed(1)} {t('hero.days')}</span>
          </p>
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px self-stretch bg-border/30" />
        <div className="lg:hidden h-px w-full bg-border/30" />

        {/* Right: 48h probability */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Timer className="w-3.5 h-3.5 text-warning" />
            {t('hero.prob48h')}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-3xl font-bold font-mono text-foreground">{pct48}%</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t('hero.prob48hHint')}</p>
        </div>
      </div>

      {/* Bottom: window + progress + advice */}
      <div className="mt-6 pt-5 border-t border-border/10 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Most likely window */}
        <div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            {t('hero.windowLabel')}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarClock className="w-4 h-4 text-primary" />
            <span className="font-mono">{windowLabel}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t('hero.windowHint')}</p>
        </div>

        {/* Wait progress */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <span>{t('hero.waitProgress')}</span>
            <span className="font-mono normal-case">
              {prediction.daysSinceLastReset.toFixed(1)}d / {prediction.medianIntervalDays.toFixed(1)}d
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-warning transition-all duration-500"
              style={{ width: `${waitPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {t('hero.lastReset')}: <span className="font-mono">{lastReset}</span>
          </p>
        </div>

        {/* Planning advice */}
        <div className={`${adviceBg} rounded-md p-3 flex items-start gap-2.5`}>
          <Lightbulb className={`w-4 h-4 ${adviceColor} mt-0.5 shrink-0`} />
          <p className="text-xs text-foreground leading-relaxed">{advice.text}</p>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
