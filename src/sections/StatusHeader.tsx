import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { formatOfficialScheduleTarget, getPlanningProbability, type PrimaryForecast } from '@/lib/forecast-display';
import {
  buildShareSummary,
  shareUrl,
  copyToClipboard,
  shareViaWebAPI,
  canNativeShare,
} from '@/lib/export-share';
import { useI18n } from '@/contexts/I18nContext';
import type { ResetPrediction } from '@/types/reset';

interface StatusHeaderProps {
  prediction: ResetPrediction;
  currentTime: number;
  isRefreshing: boolean;
  onRefresh: () => void;
  timeframe: 24 | 48;
  primaryForecast: PrimaryForecast;
}

export function StatusHeader({ prediction, currentTime, isRefreshing, onRefresh, timeframe, primaryForecast }: StatusHeaderProps) {
  const { locale, setLocale, t } = useI18n();
  const [copied, setCopied] = useState(false);
  const hasScheduledReset = primaryForecast.kind === 'official-schedule';
  const pct = Math.round(getPlanningProbability(timeframe === 24 ? prediction.prob24h : prediction.prob48h, prediction.signals, primaryForecast) * 100);
  const scheduledTargetStr = hasScheduledReset ? formatOfficialScheduleTarget(primaryForecast.scheduledAt, locale) : null;
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

  const minutes = Math.max(0, Math.floor((currentTime - prediction.generatedAt) / 60000));
  const age = minutes < 1 ? t('header.justNow')
    : minutes < 60 ? t('header.minutesAgo', { n: minutes })
    : t('header.hoursAgo', { n: Math.floor(minutes / 60) });

  return (
    <header className="sticky top-0 z-50 border-b border-border/20 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto grid min-h-16 max-w-4xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2 md:grid-cols-[minmax(0,1fr)_auto_auto] md:px-6">
        <div className="min-w-0">
          <h1 className="font-mono text-xs font-semibold text-foreground sm:text-sm">{t('app.title')}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            {t('header.updated')} · {age}
          </p>
        </div>
        <nav aria-label={t('header.navigation')} className="col-span-2 row-start-2 flex items-center justify-end gap-2 border-t border-border/20 pt-2 font-mono text-xs md:col-span-1 md:col-start-2 md:row-start-1 md:border-t-0 md:pt-0">
          <a href={guideHref} className="inline-flex min-h-11 items-center whitespace-nowrap px-1 text-muted-foreground hover:text-foreground">{t('header.guide')}</a>
          <button onClick={handleShare} className="command-action whitespace-nowrap text-muted-foreground hover:text-foreground" aria-live="polite">
            {copied ? t('header.copied') : t('header.share')}
          </button>
          <a href="#alerts" className="command-action command-action-primary whitespace-nowrap">{t('header.alerts')}</a>
        </nav>
        <div className="col-start-2 row-start-1 flex items-center gap-1 font-mono text-xs md:col-start-3 md:border-l md:border-border/30 md:pl-2">
          <button
            onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
            className="min-h-11 min-w-11 text-muted-foreground hover:text-foreground"
            aria-label={t('header.language')}
          >
            {locale === 'en' ? '中文' : 'EN'}
          </button>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-busy={isRefreshing}
            aria-label={t('header.refresh')}
            title={t('header.refresh')}
            className="min-h-11 min-w-11 text-muted-foreground hover:text-foreground disabled:cursor-wait disabled:opacity-70"
          >
            <RotateCw aria-hidden="true" className={`mx-auto h-4 w-4 ${isRefreshing ? 'motion-safe:animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
