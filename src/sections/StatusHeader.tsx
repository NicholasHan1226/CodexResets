import { useI18n } from '@/contexts/I18nContext';
import type { ResetPrediction } from '@/types/reset';
import { Radar, Globe, Share2, Download, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';

interface StatusHeaderProps {
  prediction: ResetPrediction;
  isLive: boolean;
  onRefresh: () => void;
  onShare?: () => void;
  onExport?: () => void;
}

export function StatusHeader({ prediction, isLive, onRefresh, onShare, onExport }: StatusHeaderProps) {
  const { locale, setLocale, t } = useI18n();
  const [utcTime, setUtcTime] = useState('');

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      setUtcTime(`${hh}:${mm} UTC`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const formatTimeAgo = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    if (minutes < 1) return t('header.justNow');
    if (minutes < 60) return t('header.minutesAgo', { n: minutes });
    return t('header.hoursAgo', { n: hours });
  };

  return (
    <header className="bg-card/60 backdrop-blur-md sticky top-0 z-50 border-b border-border/10">
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
        {/* Left: Logo + Title */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center glow-pulse">
            <Radar className="w-4 h-4 text-primary" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-base text-foreground tracking-tight">{t('app.title')}</span>
            <span className="text-[10px] font-mono text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
              {prediction.modelVersion}
            </span>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono ${
            isLive
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              isLive ? 'bg-primary live-breathe' : 'bg-muted-foreground'
            }`} />
            {isLive ? t('header.liveMonitoring') : t('header.simulated')}
          </span>
        </div>

        {/* Right: Time + Actions */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{utcTime}</span>
          </div>
          <span className="hidden sm:inline text-xs text-muted-foreground/50">
            {t('header.updated')} {formatTimeAgo(prediction.generatedAt)}
          </span>

          {/* Language switcher */}
          <button
            onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
            className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors text-muted-foreground"
            aria-label={t('header.language')}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="text-xs font-mono">{locale === 'en' ? '中文' : 'EN'}</span>
          </button>

          {/* Share */}
          {onShare && (
            <button
              onClick={onShare}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
              aria-label={t('header.share')}
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Export */}
          {onExport && (
            <button
              onClick={onExport}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
              aria-label={t('header.export')}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Refresh */}
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors"
          >
            {t('header.refresh')}
          </button>
        </div>
      </div>
    </header>
  );
}
