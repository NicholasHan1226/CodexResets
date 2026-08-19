import { useI18n } from '@/contexts/I18nContext';
import type { ResetPrediction } from '@/types/reset';
import { Card } from '@/components/ui/card';
import { Radio, Loader2 } from 'lucide-react';

interface SignalPanelProps {
  prediction: ResetPrediction;
  loading?: boolean;
}

function SignalBar({ value, status }: { value: number; status: string }) {
  const color = status === 'active' ? 'bg-primary' : status === 'weak' ? 'bg-amber-400' : 'bg-muted';
  return (
    <div className="flex gap-0.5">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className={`w-1.5 h-4 rounded-sm transition-all duration-300 ${
            i < value ? color : 'bg-muted/30'
          }`}
        />
      ))}
    </div>
  );
}

export function SignalPanel({ prediction, loading }: SignalPanelProps) {
  const { t } = useI18n();

  const statusTextMap: Record<string, string> = {
    'active': t('signals.active'),
    'weak': t('signals.weak'),
    'idle': t('signals.idle'),
  };

  return (
    <Card className="p-5 bg-card border-border/50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" />
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            {t('signals.title')}
          </h2>
        </div>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {prediction.signals.map((signal) => (
          <div
            key={signal.label}
            className="p-3 rounded-lg bg-muted/30 border border-border/30 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-foreground">{signal.label}</span>
              <SignalBar value={signal.value} status={signal.status} />
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{signal.description}</p>
            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs font-mono ${
                signal.status === 'active' ? 'text-primary' : 
                signal.status === 'weak' ? 'text-amber-400' : 
                'text-muted-foreground'
              }`}>
                {statusTextMap[signal.status] || signal.status}
              </span>
              <span className="text-xs text-muted-foreground">{signal.source}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
