import { useI18n } from '@/contexts/I18nContext';
import type { ResetPrediction } from '@/types/reset';
import { Activity, Globe, Share2, Download } from 'lucide-react';

interface StatusHeaderProps {
  prediction: ResetPrediction;
  isLive: boolean;
  onRefresh: () => void;
  onShare?: () => void;
  onExport?: () => void;
}

export function StatusHeader({ prediction, isLive, onRefresh, onShare, onExport }: StatusHeaderProps) {
  const { locale, setLocale, t } = useI18n();

  const formatTimeAgo = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return t('header.justNow');
    if (minutes < 60) return t('header.minutesAgo', { n: minutes });
    return t('header.hoursAgo', { n: hours });
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-border/50">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">{t('app.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono ${
            isLive 
              ? 'bg-primary/10 text-primary' 
              : 'bg-muted text-muted-foreground'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              isLive ? 'bg-primary animate-pulse' : 'bg-muted-foreground'
            }`} />
            {isLive ? t('header.liveMonitoring') : t('header.simulated')}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="font-mono">{t('header.model')} {prediction.modelVersion}</span>
        <span className="text-border">|</span>
        <span>{t('header.updated')} {formatTimeAgo(prediction.generatedAt)}</span>
        
        {/* Language switcher */}
        <button
          onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
          className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors"
          aria-label={t('header.language')}
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="text-xs font-mono">{locale === 'en' ? '中文' : 'EN'}</span>
        </button>
        
        {/* Share button */}
        {onShare && (
          <button
            onClick={onShare}
            className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors"
            aria-label={t('header.share')}
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        )}
        
        {/* Export button */}
        {onExport && (
          <button
            onClick={onExport}
            className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors"
            aria-label={t('header.export')}
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
        
        <button
          onClick={onRefresh}
          className="px-3 py-1 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
        >
          {t('header.refresh')}
        </button>
      </div>
    </header>
  );
}
