import { useI18n } from '@/contexts/I18nContext';

interface GuideLinksProps {
  className?: string;
}

/** Crawlable next-read links for the homepage, about page, and fail-closed state. */
export function GuideLinks({ className }: GuideLinksProps) {
  const { t, locale } = useI18n();
  const limitsHref = locale === 'zh' ? '/zh/codex-usage-limits/' : '/guides/codex-usage-limits/';
  const forecastHref = locale === 'zh' ? '/zh/codex-reset-prediction/' : '/guides/codex-reset-prediction/';

  return (
    <nav aria-label={t('footer.guides')} className={className}>
      <span className="text-muted-foreground/70">{t('footer.guides')}</span>
      <span className="text-border">:</span>
      {' '}
      <a href={limitsHref} className="text-muted-foreground transition-colors hover:text-foreground">{t('footer.guideLimits')}</a>
      <span className="mx-1.5 text-border">·</span>
      <a href={forecastHref} className="text-muted-foreground transition-colors hover:text-foreground">{t('footer.guideForecast')}</a>
      <span className="mx-1.5 text-border">·</span>
      <a href="/guides/codex-reset-history/" className="text-muted-foreground transition-colors hover:text-foreground">{t('footer.guideHistory')}</a>
      {locale === 'en' && (
        <>
          <span className="mx-1.5 text-border">·</span>
          <a href="/zh/codex-reset-prediction/" lang="zh-CN" className="text-muted-foreground transition-colors hover:text-foreground">{t('footer.guideZh')}</a>
        </>
      )}
    </nav>
  );
}
