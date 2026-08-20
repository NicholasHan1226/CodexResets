import { useI18n } from '@/contexts/I18nContext';

export function ModelInfo() {
  const { t } = useI18n();

  return (
    <section aria-label="About the model" className="max-w-3xl">
      <h2 className="text-lg font-semibold text-foreground">
        {t('model.title')}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          <span className="text-foreground font-medium">{t('model.signalBased')}.</span>{' '}
          {t('model.signalBasedDesc')}
        </p>
        <p>
          <span className="text-foreground font-medium">{t('model.historicalData')}.</span>{' '}
          {t('model.historicalDataDesc')}
        </p>
        <p>
          <span className="text-foreground font-medium">{t('model.weibullModel')}.</span>{' '}
          {t('model.weibullModelDesc')}
        </p>
        <p className="pt-2 border-t border-border/20 text-warning/80">
          {t('model.disclaimerDesc')}
        </p>
      </div>
    </section>
  );
}
