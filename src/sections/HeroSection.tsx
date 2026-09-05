import { getEffectiveHistory } from '@/lib/reset-data';
import { useI18n } from '@/contexts/I18nContext';
import { ProbabilityCurve } from '@/sections/ProbabilityCurve';
import { ProbabilityDisplay } from '@/sections/ProbabilityDisplay';
import { formatOfficialScheduleCountdown, formatOfficialScheduleTarget, getPlanningProbability, getPrimaryForecast, type PrimaryForecast } from '@/lib/forecast-display';
import type { ResetPrediction } from '@/types/reset';

interface HeroSectionProps {
  prediction: ResetPrediction;
  timeframe: 24 | 48;
  onTimeframeChange: (tf: 24 | 48) => void;
  primaryForecast: PrimaryForecast;
  currentTime: number;
}

export function HeroSection({ prediction, timeframe, onTimeframeChange, primaryForecast, currentTime }: HeroSectionProps) {
  const { t, locale } = useI18n();
  const modelPct24 = Math.round(prediction.prob24h * 100);
  const modelPct48 = Math.round(prediction.prob48h * 100);
  const forecast24 = getPrimaryForecast(prediction.signals, 24, currentTime);
  const forecast48 = getPrimaryForecast(prediction.signals, 48, currentTime);
  const pct24 = Math.round(getPlanningProbability(prediction.prob24h, prediction.signals, forecast24) * 100);
  const pct48 = Math.round(getPlanningProbability(prediction.prob48h, prediction.signals, forecast48) * 100);
  const modelPct = timeframe === 24 ? modelPct24 : modelPct48;

  const lastResetDate = prediction.lastReset ? new Date(prediction.lastReset) : null;
  const daysSince = prediction.daysSinceLastReset;
  const hasScheduledReset = primaryForecast.kind === 'official-schedule';
  const pct = timeframe === 24 ? pct24 : pct48;
  const isOfficialBoosted = pct !== modelPct;
  // The question, verdict, large number and curve must all describe
  // the selected rolling horizon. "Today" is not interchangeable with the
  // next 24 hours, especially for visitors arriving late in the day.
  const verdictKey = primaryForecast.kind === 'official-schedule'
    ? primaryForecast.window === 'after'
      ? 'hero.answerScheduledAfter'
      : primaryForecast.window === 'grace'
        ? 'hero.answerScheduledGrace'
      : primaryForecast.window === 'elapsed'
        ? 'hero.answerScheduledElapsed'
        : primaryForecast.window === 'pending'
        ? 'hero.answerScheduledPending'
        : 'hero.answerScheduled'
    : pct >= 60
    ? 'hero.answerYes'
    : pct >= 30
      ? 'hero.answerWatch'
      : 'hero.answerNo';

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
    : null;

  const scheduledTargetStr = hasScheduledReset
    ? formatOfficialScheduleTarget(primaryForecast.scheduledAt, locale)
    : null;
  const scheduledCountdownStr = hasScheduledReset
    ? formatOfficialScheduleCountdown(primaryForecast.scheduledAt, currentTime, locale)
    : null;

  return (
    <section aria-label="Reset probability" className="hero-stage max-w-4xl border border-border/50 bg-muted/10">
      <header className="border-b border-border/40 px-4 py-4 sm:px-5">
        <p className="font-mono text-xs text-muted-foreground">{t('hero.question', { n: timeframe })}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{t(verdictKey)}</h2>
      </header>

      <div className="grid md:grid-cols-[minmax(0,1fr)_240px]">
        <div id="curve" className="min-w-0 scroll-mt-24 p-4 sm:p-5 md:col-start-1 md:row-start-1">
          <ProbabilityCurve
            currentTime={currentTime}
            curve={prediction.curve}
            hours={timeframe}
            planningProbability={getPlanningProbability(timeframe === 24 ? prediction.prob24h : prediction.prob48h, prediction.signals, primaryForecast)}
            officialScheduleAt={primaryForecast.kind === 'official-schedule' && primaryForecast.window === 'within' ? primaryForecast.scheduledAt : undefined}
          />
        </div>
        <div className="min-w-0 row-start-1 border-b border-border/40 p-4 sm:p-5 md:col-start-2 md:border-b-0 md:border-l">
          <ProbabilityDisplay
            pct={pct}
            pct24={pct24}
            pct48={pct48}
            modelPct={isOfficialBoosted ? modelPct : undefined}
            timeframe={timeframe}
            onTimeframeChange={onTimeframeChange}
            officialSchedule={hasScheduledReset
              ? { window: primaryForecast.window, targetLabel: scheduledTargetStr, countdownLabel: scheduledCountdownStr }
              : undefined}
          />
          <div className="mt-5 border-t border-border/40 pt-4 text-xs leading-relaxed text-muted-foreground">
            <p>{t('hero.lastResetLabel')}</p>
            <p className="mt-1 font-mono text-sm text-foreground">{daysSince.toFixed(1)} {t('hero.daysAgo')}</p>
            {lastResetStr && <p className="mt-1 font-mono text-xs">{lastResetStr}</p>}
            <p className="mt-3">{t('hero.historySample', { n: getEffectiveHistory().length })}</p>
          </div>
        </div>
      </div>

      <footer className="border-t border-border/40 px-4 py-3 sm:px-5">
        <p className="text-xs leading-relaxed text-muted-foreground">{t('hero.scope')}</p>
      </footer>
    </section>
  );
}

export default HeroSection;
