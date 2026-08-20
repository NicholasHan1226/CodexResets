import { useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import {
  sharePredictionState,
  copyToClipboard,
  buildShareTargets,
  shareViaWebAPI,
  canNativeShare,
} from '@/lib/export-share';
import type { ResetPrediction } from '@/types/reset';

interface HeroSectionProps {
  prediction: ResetPrediction;
  timeframe: 24 | 48;
  onTimeframeChange: (tf: 24 | 48) => void;
}

const BAR_WIDTH = 30;

export function HeroSection({ prediction, timeframe, onTimeframeChange }: HeroSectionProps) {
  const { t, locale } = useI18n();
  const [copied, setCopied] = useState(false);
  const pct24 = Math.round(prediction.prob24h * 100);
  const pct48 = Math.round(prediction.prob48h * 100);
  const pct = timeframe === 24 ? pct24 : pct48;

  const lastResetDate = prediction.lastReset ? new Date(prediction.lastReset) : null;
  const daysSince = prediction.daysSinceLastReset;
  const isLikely = pct24 >= 50;

  const filled = Math.round((pct / 100) * BAR_WIDTH);
  const barFilled = '█'.repeat(filled);
  const barEmpty = '░'.repeat(BAR_WIDTH - filled);

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

  const shareUrl = () =>
    sharePredictionState({
      probability24h: prediction.prob24h,
      probability48h: prediction.prob48h,
      daysSinceLastReset: prediction.daysSinceLastReset,
      medianInterval: prediction.medianIntervalDays,
    });
  const shareText = () => t('hero.shareText', { n: pct, h: timeframe });

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
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground/70 uppercase tracking-widest">
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
                    : 'text-muted-foreground/40 hover:text-muted-foreground'
                }`}
              >
                [{tf}h]
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-baseline">
          <span className="font-mono text-8xl sm:text-9xl font-semibold leading-none tracking-tighter text-primary">
            {pct}
          </span>
          <span className="font-mono text-4xl sm:text-5xl text-primary/40">%</span>
        </div>

        {/* ASCII probability bar */}
        <p className="mt-5 font-mono text-sm leading-none select-none" aria-hidden="true">
          <span className="text-primary">{barFilled}</span>
          <span className="text-muted-foreground/15">{barEmpty}</span>
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {t('hero.withinHours', { n: timeframe })}
        </p>
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

      {/* Share */}
      <div className="mt-4 font-mono text-xs flex flex-wrap items-center gap-x-1 gap-y-1.5">
        <span className="text-muted-foreground/50 mr-1">{t('hero.sharePrompt')}</span>
        {buildShareTargets(shareText(), shareUrl()).map((target) => (
          <a
            key={target.id}
            href={target.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            [{target.label}]
          </a>
        ))}
        {canNativeShare() && (
          <button
            onClick={() => shareViaWebAPI(t('app.title'), shareText(), shareUrl())}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            [{t('hero.shareMore')}]
          </button>
        )}
        <button
          onClick={async () => {
            if (await copyToClipboard(shareUrl())) {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }
          }}
          className="text-primary hover:text-primary/80 transition-colors"
        >
          {copied ? t('hero.copied') : t('hero.shareLink')}
        </button>
      </div>
    </section>
  );
}

export default HeroSection;
