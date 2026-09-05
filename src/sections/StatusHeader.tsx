import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Languages, Menu, RotateCw, Share2, X } from 'lucide-react';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(copyTimer.current), []);
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);
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
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  const guideHref = locale === 'zh' ? '/zh/codex-reset-prediction/' : '/guides/codex-reset-prediction/';

  const minutes = Math.max(0, Math.floor((currentTime - prediction.generatedAt) / 60000));
  const age = minutes < 1 ? t('header.justNow')
    : minutes < 60 ? t('header.minutesAgo', { n: minutes })
    : t('header.hoursAgo', { n: Math.floor(minutes / 60) });

  return (
    <header ref={headerRef} className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur-sm">
      <div className="relative mx-auto flex min-h-16 max-w-4xl items-center gap-2 px-4 py-2 md:gap-3 md:px-6">
        <div className="min-w-0 flex-1">
          <a href="#top" onClick={() => setMenuOpen(false)} aria-label={t('header.home')} className="inline-block rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <h1 className="font-mono text-xs font-semibold text-foreground sm:text-sm">{t('app.title')}</h1>
          </a>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            {t('header.updated')} · {age}
          </p>
        </div>

        <a href="#alerts" onClick={() => setMenuOpen(false)} className="header-action header-action-primary shrink-0 md:order-3">{t('header.alerts')}</a>
        <button ref={menuButtonRef} type="button" aria-expanded={menuOpen} aria-controls="header-navigation"
          aria-label={t(menuOpen ? 'header.closeMenu' : 'header.openMenu')}
          onClick={() => setMenuOpen((open) => !open)} className="header-action w-11 shrink-0 px-0 md:hidden">
          {menuOpen ? <X aria-hidden="true" className="h-4 w-4" /> : <Menu aria-hidden="true" className="h-4 w-4" />}
        </button>

        <nav id="header-navigation" aria-label={t('header.navigation')}
          className={`${menuOpen ? 'flex' : 'hidden'} absolute inset-x-0 top-full flex-col gap-2 border-b border-border bg-background p-4 shadow-lg md:static md:order-2 md:flex md:flex-row md:items-center md:gap-1 md:border-0 md:bg-transparent md:p-0 md:shadow-none`}>
          <a href={guideHref} onClick={() => setMenuOpen(false)} className="header-action header-action-menu">
            {t('header.guide')}<ChevronRight aria-hidden="true" className="ml-auto h-4 w-4 md:hidden" />
          </a>
          <button type="button" onClick={handleShare} className="header-action header-action-menu" aria-live="polite">
            {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Share2 aria-hidden="true" className="h-4 w-4" />}
            {copied ? t('header.copied') : t('header.share')}
          </button>
          <div className="mt-1 grid grid-cols-2 gap-2 border-t border-border/40 pt-3 md:ml-1 md:mt-0 md:flex md:gap-1 md:border-l md:border-t-0 md:pl-2 md:pt-0">
            <button type="button" onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
              className="header-action" aria-label={t('header.language')} title={t('header.language')}>
              <Languages aria-hidden="true" className="h-4 w-4 md:hidden" />{locale === 'en' ? '中文' : 'EN'}
            </button>
            <button type="button" onClick={onRefresh} disabled={isRefreshing} aria-busy={isRefreshing}
              aria-label={t('header.refresh')} title={t('header.refresh')} className="header-action md:w-11 md:px-0">
              <RotateCw aria-hidden="true" className={`h-4 w-4 ${isRefreshing ? 'motion-safe:animate-spin' : ''}`} />
              <span className="md:hidden">{t('header.refresh')}</span>
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
