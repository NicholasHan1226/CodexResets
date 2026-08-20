import { useI18n } from '@/contexts/I18nContext';
import type { ResetPrediction } from '@/types/reset';
import { Globe, Share2, Download } from 'lucide-react';
import { Link } from 'react-router';
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
    <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-sm border-b border-border/20">
      <div className="max-w-3xl mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
        {/* Left: Title + status */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold text-foreground">{t('app.title')}</span>
          <span className="font-mono text-[10px] text-muted-foreground/50">
            {prediction.modelVersion}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${
              isLive ? 'bg-primary live-dot' : 'bg-muted-foreground/40'
            }`} />
            <span className="font-mono text-[10px] text-muted-foreground">
              {isLive ? 'LIVE' : 'SIM'}
            </span>
          </span>
        </div>

        {/* Right: Time + actions */}
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline font-mono text-xs text-muted-foreground/60">
            {utcTime}
          </span>
          <span className="hidden md:inline font-mono text-[10px] text-muted-foreground/40">
            {formatTimeAgo(prediction.generatedAt)}
          </span>

          <Link
            to="/about"
            className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            [docs]
          </Link>

          <button
            onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('header.language')}
          >
            <Globe className="w-3.5 h-3.5" />
          </button>

          {onShare && (
            <button
              onClick={onShare}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('header.share')}
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          )}

          {onExport && (
            <button
              onClick={onExport}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('header.export')}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={onRefresh}
            className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            [refresh]
          </button>
        </div>
      </div>
    </header>
  );
}
