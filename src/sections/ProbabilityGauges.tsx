import { useI18n } from '@/contexts/I18nContext';
import type { ResetPrediction } from '@/types/reset';
import { Card } from '@/components/ui/card';

interface ProbabilityGaugesProps {
  prediction: ResetPrediction;
}

function CircularProgress({ value, label, size = 100 }: { value: number; label: string; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth="4"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
            style={{
              filter: 'drop-shadow(0 0 4px hsl(var(--primary) / 0.5))'
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-mono font-bold text-foreground">
            {Math.round(value)}%
          </span>
        </div>
      </div>
      <span className="text-xs font-mono text-muted-foreground">{label}</span>
    </div>
  );
}

export function ProbabilityGauges({ prediction }: ProbabilityGaugesProps) {
  const { t } = useI18n();

  return (
    <Card className="p-5 bg-card border-border/50">
      <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-4">
        {t('gauges.title')}
      </h2>
      <div className="flex items-center justify-around">
        <CircularProgress value={prediction.prob24h} label={t('gauges.next24h')} />
        <CircularProgress value={prediction.prob48h} label={t('gauges.next48h')} />
      </div>
    </Card>
  );
}
