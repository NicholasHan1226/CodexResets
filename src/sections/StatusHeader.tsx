import { useI18n } from '@/contexts/I18nContext';
import type { ResetPrediction } from '@/types/reset';

interface StatusHeaderProps {
  prediction: ResetPrediction;
  currentTime: number;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function StatusHeader({ prediction, currentTime, isRefreshing, onRefresh }: StatusHeaderProps) {
  const { locale, setLocale, t } = useI18n();
  const minutes = Math.max(0, Math.floor((currentTime - prediction.generatedAt) / 60000));
  const age = minutes < 1 ? t('header.justNow')
    : minutes < 60 ? t('header.minutesAgo', { n: minutes })
    : t('header.hoursAgo', { n: Math.floor(minutes / 60) });

  return (
    <header className="sticky top-0 z-50 border-b border-border/20 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex min-h-16 max-w-4xl items-center justify-between gap-2 px-4 py-2 md:px-6">
        <div className="min-w-0">
          <h1 className="font-mono text-xs font-semibold text-foreground sm:text-sm">{t('app.title')}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            {t('header.updated')} · {age}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 font-mono text-xs">
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
            className="min-h-11 min-w-11 text-muted-foreground hover:text-foreground disabled:cursor-wait disabled:opacity-70"
          >
            <span className={isRefreshing ? 'micro-refresh-pulse' : undefined}>
              {t('header.refresh')}{isRefreshing ? '…' : ''}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
