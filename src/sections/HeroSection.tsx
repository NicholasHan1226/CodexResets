import { useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { ProbabilityDisplay } from '@/sections/ProbabilityDisplay';
import {
  sharePredictionState,
  copyToClipboard,
  shareViaWebAPI,
  canNativeShare,
} from '@/lib/export-share';
import type { ResetPrediction } from '@/types/reset';

interface HeroSectionProps {
  prediction: ResetPrediction;
  timeframe: 24 | 48;
  onTimeframeChange: (tf: 24 | 48) => void;
}

export function HeroSection({ prediction, timeframe, onTimeframeChange }: HeroSectionProps) {
  const { t, locale } = useI18n();
  const [copied, setCopied] = useState(false);
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
      })
    : null;

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

  const handleShare = async () => {
    const url = sharePredictionState({
      probability24h: prediction.prob24h,
      probability48h: prediction.prob48h,
      daysSinceLastReset: prediction.daysSinceLastReset,
      medianInterval: prediction.medianIntervalDays,
    });
    // Mobile: native share sheet. Desktop: copy link.
    if (canNativeShare()) {
      const ok = await shareViaWebAPI(t('app.title'), t('hero.shareText', { n: pct, h: timeframe }), url);
      if (ok) return;
    }
    if (await copyToClipboard(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section aria-label="Reset probability">
      {/* Terminal prompt */}
      <p className="font-mono text-sm text-muted-foreground">
        <span className="text-primary">❯</span> will codex reset?{' '}
        <span className="text-muted-foreground/50">
          {isLikely ? t('hero.signalYes') : t('hero.signalNo')}
        </span>
      </p>

      {/* The probability — the single protagonist */}
      <div className="mt-10">
        <ProbabilityDisplay pct={pct} timeframe={timeframe} onTimeframeChange={onTimeframeChange} />
      </div>

      {/* Meta — one quiet line */}
      <p className="mt-8 font-mono text-xs text-muted-foreground/80">
        {t('hero.lastResetLabel')}{' '}
        <span className="text-foreground">{daysSince.toFixed(1)}d</span>
        {lastResetStr && <span className="text-muted-foreground/50"> ({lastResetStr})</span>}
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

      {/* Share — one button */}
      <p className="mt-4 font-mono text-xs">
        <button
          onClick={handleShare}
          className="text-primary hover:text-primary/80 transition-colors"
        >
          {copied ? t('hero.copied') : t('hero.shareLink')}
        </button>
      </p>
    </section>
  );
}

export default HeroSection;
