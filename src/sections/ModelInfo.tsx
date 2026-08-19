import { useI18n } from '@/contexts/I18nContext';
import { Card } from '@/components/ui/card';
import { Info, Brain, Database, TrendingUp, AlertTriangle } from 'lucide-react';

export function ModelInfo() {
  const { t } = useI18n();

  return (
    <Card className="p-5 bg-card border-border/50">
      <div className="flex items-center gap-2 mb-4">
        <Info className="w-4 h-4 text-primary" />
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {t('model.title')}
        </h2>
      </div>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <Brain className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-foreground">{t('model.signalBased')}</p>
            <p className="text-xs text-muted-foreground">{t('model.signalBasedDesc')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Database className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-foreground">{t('model.historicalData')}</p>
            <p className="text-xs text-muted-foreground">{t('model.historicalDataDesc')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <TrendingUp className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-foreground">{t('model.weibullModel')}</p>
            <p className="text-xs text-muted-foreground">{t('model.weibullModelDesc')}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-foreground">{t('model.disclaimer')}</p>
            <p className="text-xs text-muted-foreground">{t('model.disclaimerDesc')}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
