import { useI18n } from '@/contexts/I18nContext';
import { Info, Brain, Database, TrendingUp, AlertTriangle } from 'lucide-react';

export function ModelInfo() {
  const { t } = useI18n();

  return (
    <section className="bg-card rounded-lg shadow-card p-5" aria-label="About the model">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Info className="w-4 h-4 text-primary" />
        {t('model.title')}
      </h2>
      <div className="mt-4 space-y-3">
        <div className="flex items-start gap-3">
          <Brain className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-foreground">{t('model.signalBased')}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{t('model.signalBasedDesc')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Database className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-foreground">{t('model.historicalData')}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{t('model.historicalDataDesc')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <TrendingUp className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-foreground">{t('model.weibullModel')}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{t('model.weibullModelDesc')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3 pt-2 border-t border-border/10">
          <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-foreground">{t('model.disclaimer')}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{t('model.disclaimerDesc')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
