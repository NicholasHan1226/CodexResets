import { useState } from 'react';
import { getEffectiveHistory } from '@/lib/reset-data';
import { useI18n } from '@/contexts/I18nContext';
import { ProbabilityDisplay } from '@/sections/ProbabilityDisplay';
import { formatOfficialScheduleCountdown, formatOfficialScheduleTarget, getPlanningProbability, getPrimaryForecast, type PrimaryForecast } from '@/lib/forecast-display';
import {
  buildShareSummary,
  shareUrl,
  copyToClipboard,
  shareViaWebAPI,
  canNativeShare,
} from '@/lib/export-share';
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
  const [copied, setCopied] = useState(false);
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
  // The question, verdict, large number, curve, and advice must all describe
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

  const handleShare = async () => {
    const summary = buildShareSummary({
      pct,
      hours: timeframe,
      daysSince: prediction.daysSinceLastReset,
      medianDays: prediction.medianIntervalDays,
      officialSchedule: hasScheduledReset
        ? { targetLabel: scheduledTargetStr, window: primaryForecast.window }
        : undefined,
    }, locale);
    // Mobile: native share sheet. Desktop: copy summary + link.
    if (canNativeShare()) {
      const ok = await shareViaWebAPI(t('app.title'), summary, shareUrl());
      if (ok) return;
    }
    if (await copyToClipboard(`${summary}\n${shareUrl()}`)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const guideHref = locale === 'zh' ? '/zh/codex-reset-prediction/' : '/guides/codex-reset-prediction/';

  return (
    <section aria-label="Reset probability" className="hero-stage max-w-4xl">
      {/* Terminal prompt — answer first, then the evidence in dim text */}
      <p className="font-mono text-sm text-muted-foreground">
        <span className="text-primary">❯</span> {t('hero.question', { n: timeframe })} →{' '}
        <span className="text-foreground font-semibold">
          {t(verdictKey)}
        </span>
        {!hasScheduledReset && (
          <span className="text-muted-foreground/70">
            {' '}
            {t('hero.windowStat', { pct: pct24, n: 24 })}
            <span className="mx-1.5 text-muted-foreground/50">·</span>
            {t('hero.windowStat', { pct: pct48, n: 48 })}
          </span>
        )}
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {t('hero.scope')}
      </p>

      {/* The probability — the single protagonist */}
      <div className="mt-7 md:mt-9">
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
      </div>

      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        {t('hero.historySample', { n: getEffectiveHistory().length })}
      </p>

      {/* Meta — one quiet line */}
      <p className="mt-5 font-mono text-xs text-muted-foreground/80">
        <span className="mr-2 inline-block max-w-full">
          {t('hero.lastResetLabel')}{' '}
          <span className="text-foreground">{daysSince.toFixed(1)}d</span>
          {lastResetStr && <span className="text-muted-foreground/50"> ({lastResetStr})</span>}
        </span>
        <span className="mr-2 inline-block max-w-full">
          <span className="mr-2 text-border">·</span>
          {t('hero.medianGap')}{' '}
          <span className="text-foreground">{prediction.medianIntervalDays.toFixed(1)}d</span>
        </span>
      </p>

      {/* Advice */}
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        <span className="text-foreground font-medium">{t('hero.adviceLabel')}</span>{' '}
        {t(hasScheduledReset
          ? primaryForecast.window === 'elapsed'
            ? 'advice.scheduledElapsed'
            : primaryForecast.window === 'grace'
              ? 'advice.scheduledGrace'
            : primaryForecast.window === 'pending'
              ? 'advice.scheduledPending'
              : 'advice.scheduled'
          : `advice.${prediction.advice[timeframe].level}`)}
      </p>

      {/* Subscribe is the page's only solid CTA; share and guides stay quieter. */}
      <p className="mt-5 flex flex-wrap items-center gap-2 font-mono text-xs">
        <a href="#alerts" className="command-action command-action-primary">
          {t('hero.alertCta')}
        </a>
        <button
          onClick={handleShare}
          className="command-action text-muted-foreground hover:text-foreground"
        >
          {copied ? t('hero.copied') : t('hero.shareLink')}
        </button>
        <a href={guideHref} className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground">
          {t('hero.guideLink')}
        </a>
      </p>
    </section>
  );
}

export default HeroSection;
