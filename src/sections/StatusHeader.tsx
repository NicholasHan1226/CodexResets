import { useI18n } from '@/contexts/I18nContext';
import type { ResetPrediction } from '@/types/reset';
import { Link } from 'react-router';
import { useState, useEffect } from 'react';

interface StatusHeaderProps {
  prediction: ResetPrediction;
  isLive: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onShare?: () => void;
}

export function StatusHeader({ prediction, isLive, isRefreshing, onRefresh, onShare }: StatusHeaderProps) {
  const { locale, setLocale, t } = useI18n();
  const [utcTime, setUtcTime] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      setUtcTime(`${hh}:${mm} UTC`);
      setNow(d.getTime());
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const formatTimeAgo = (timestamp: number): string => {
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    if (minutes < 1) return t('header.justNow');
    if (minutes < 60) return t('header.minutesAgo', { n: minutes });
    return t('header.hoursAgo', { n: hours });
  };

  return (
    <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-sm border-b border-border/20">
      <div className="mx-auto flex min-h-12 max-w-4xl items-center justify-between gap-3 px-3 py-2 sm:px-4 md:px-6">
        {/* Left: Title + status */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="shrink-0 whitespace-nowrap font-mono text-[11px] font-semibold text-foreground sm:text-sm">{t('app.title')}</span>
          <span className="hidden font-mono text-[10px] text-muted-foreground/50 md:inline">
            {prediction.modelVersion}
          </span>
          {!isRefreshing && (
            <span className="flex shrink-0 items-center gap-1.5" aria-label={isLive ? 'Live data' : 'Simulated data'}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                isLive ? 'bg-primary live-dot' : 'bg-muted-foreground/40'
              }`} />
              <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                {isLive ? 'LIVE' : 'SIM'}
              </span>
            </span>
          )}
        </div>

        {/* Right: Time + actions */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden sm:inline font-mono text-xs text-muted-foreground/60">
            {utcTime}
          </span>
          <span className="hidden md:inline font-mono text-[10px] text-muted-foreground/40">
            {formatTimeAgo(prediction.generatedAt)}
          </span>

          <Link
            to="/about"
            className="hidden font-mono text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            [docs]
          </Link>

          <a
            href="/guides/codex-reset-prediction/"
            className="hidden font-mono text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            [{t('header.guide')}]
          </a>

          <button
            onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
            className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('header.language')}
          >
            {locale === 'en' ? '[中文]' : '[EN]'}
          </button>

          {onShare && (
            <button
              onClick={onShare}
              className="hidden font-mono text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline"
              aria-label={t('header.share')}
            >
              [share]
            </button>
          )}

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-busy={isRefreshing}
            className="font-mono text-xs text-muted-foreground transition-[color,transform] hover:text-foreground active:translate-y-px disabled:cursor-wait disabled:opacity-70"
          >
            <span className={isRefreshing ? 'micro-refresh-pulse' : undefined}>
              {isRefreshing ? '[refresh…]' : '[refresh]'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
