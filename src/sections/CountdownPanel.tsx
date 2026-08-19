import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Zap, CheckCircle } from "lucide-react";
import type { ResetPrediction, AdviceLevel } from "@/types/reset";
import { useI18n } from "@/contexts/I18nContext";

interface ResetEstimatePanelProps {
  prediction: ResetPrediction;
}

const adviceConfig: Record<AdviceLevel, { icon: typeof AlertTriangle; color: string; bg: string; border: string }> = {
  'wait': { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
  'cautious': { icon: Zap, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
  'use_freely': { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
  'critical': { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' },
};

export function ResetEstimatePanel({ prediction }: ResetEstimatePanelProps) {
  const { t } = useI18n();
  const { prob24h, prob48h, daysSinceLastReset, medianIntervalDays, advice } = prediction;
  const config = adviceConfig[advice.level];
  const AdviceIcon = config.icon;

  // Wait progress: how far through the median interval are we?
  const waitProgress = Math.min(100, (daysSinceLastReset / medianIntervalDays) * 100);
  const waitRatio = daysSinceLastReset / medianIntervalDays;

  return (
    <Card className="relative overflow-hidden border-border/40">
      {/* Subtle pulse background when probability is high */}
      {prob24h >= 40 && (
        <div className="absolute inset-0 bg-primary/5 animate-pulse" aria-hidden="true" />
      )}
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t('resetEstimate.title')}
          </CardTitle>
          <Badge variant="outline" className="font-mono text-[10px]">
            v{prediction.modelVersion}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Probability display - large and prominent */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="text-4xl font-mono font-bold text-primary tabular-nums">
              {prob24h}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {t('resetEstimate.prob24h')}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-mono font-semibold text-foreground/80 tabular-nums">
              {prob48h}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {t('resetEstimate.prob48h')}
            </div>
          </div>
        </div>

        {/* Wait progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {t('resetEstimate.waiting')} <span className="font-mono text-foreground">{daysSinceLastReset.toFixed(1)}d</span>
            </span>
            <span className="text-muted-foreground">
              {t('resetEstimate.median')} <span className="font-mono text-foreground">{medianIntervalDays.toFixed(1)}d</span>
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={Math.round(waitProgress)} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                waitRatio >= 1.5 ? 'bg-amber-400' : waitRatio >= 1 ? 'bg-primary' : 'bg-primary/60'
              }`}
              style={{ width: `${waitProgress}%` }}
            />
          </div>
          {waitRatio >= 1.5 && (
            <p className="text-xs text-amber-400">{t('resetEstimate.overdue')}</p>
          )}
        </div>

        {/* Planning advice */}
        <div className={`flex items-center gap-2 rounded-lg border p-3 ${config.bg} ${config.border}`}>
          <AdviceIcon className={`h-4 w-4 flex-shrink-0 ${config.color}`} aria-hidden="true" />
          <div>
            <div className={`text-sm font-medium ${config.color}`}>
              {t(`advice.${advice}.title`)}
            </div>
            <div className="text-xs text-muted-foreground">
              {t(`advice.${advice}.desc`)}
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-[10px] text-muted-foreground/60 text-center">
          {t('resetEstimate.disclaimer')}
        </p>
      </CardContent>
    </Card>
  );
}
