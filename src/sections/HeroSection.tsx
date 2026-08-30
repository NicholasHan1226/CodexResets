import { useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { ProbabilityDisplay } from '@/sections/ProbabilityDisplay';
import { formatOfficialScheduleCountdown, formatOfficialScheduleTarget, getPlanningProbability, type PrimaryForecast } from '@/lib/forecast-display';
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
  const pct24 = Math.round(prediction.prob24h * 100);
  const pct48 = Math.round(prediction.prob48h * 100);
  const modelPct = timeframe === 24 ? pct24 : pct48;

  const lastResetDate = prediction.lastReset ? new Date(prediction.lastReset) : null;
  const daysSince = prediction.daysSinceLastReset;
  const officialSignal = prediction.signals.find((signal) => signal.source === 'tibopost');
  const hasScheduledReset = primaryForecast.kind === 'official-schedule';
  const pct = Math.round(getPlanningProbability(modelPct / 100, prediction.signals, primaryForecast) * 100);
  const isOfficialBoosted = pct !== modelPct;
  // The wording tracks probability bands: a middle range should not read as
  // either a dismissal or a guarantee. A direct official schedule is a
  // strong live input, while the independently calibrated history model stays
  // visible beside it rather than being replaced.
  const verdictKey = hasScheduledReset
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
  const signalCopy = officialSignal?.status === 'active'
    ? 'hero.signalYes'
    : officialSignal?.status === 'weak'
      ? 'hero.signalWatch'
      : 'hero.signalNo';

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

  return (
    <section aria-label="Reset probability" className="hero-stage max-w-4xl">
      {/* Terminal prompt — answer first, then the evidence in dim text */}
      <p className="font-mono text-sm text-muted-foreground">
        <span className="text-primary">❯</span> {t('hero.question', { n: timeframe })} →{' '}
        <span className="text-foreground font-semibold">
          {t(verdictKey)}
        </span>{' '}
        {!hasScheduledReset && (
          <span className="text-muted-foreground/50">
            ({t(signalCopy)})
          </span>
        )}
      </p>

      {/* The probability — the single protagonist */}
      <div className="mt-10">
        <ProbabilityDisplay
          pct={pct}
          modelPct={isOfficialBoosted ? modelPct : undefined}
          timeframe={timeframe}
          onTimeframeChange={onTimeframeChange}
          officialSchedule={hasScheduledReset
            ? { window: primaryForecast.window, targetLabel: scheduledTargetStr, countdownLabel: scheduledCountdownStr }
            : undefined}
        />
      </div>

      {/* Meta — one quiet line */}
      <p className="mt-8 font-mono text-xs text-muted-foreground/80">
        <span className="mr-2 inline-block whitespace-nowrap">
          {t('hero.lastResetLabel')}{' '}
          <span className="text-foreground">{daysSince.toFixed(1)}d</span>
          {lastResetStr && <span className="text-muted-foreground/50"> ({lastResetStr})</span>}
        </span>
        <span className="mr-2 inline-block whitespace-nowrap">
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

      {/* Low-friction actions — subscription remains the page's only solid CTA. */}
      <p className="mt-4 flex flex-wrap gap-2 font-mono text-xs">
        <button
          onClick={handleShare}
          className="command-action text-primary"
        >
          {copied ? t('hero.copied') : t('hero.shareLink')}
        </button>
        <a href="#alerts" className="command-action text-muted-foreground hover:text-foreground">
          {t('hero.alertLink')}
        </a>
      </p>
    </section>
  );
}

export default HeroSection;
