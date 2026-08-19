import { useI18n } from '@/contexts/I18nContext';
import type { ResetPrediction } from '@/types/reset';
import { SatelliteDish, Loader2, MessageSquare, Server, Hourglass, Megaphone } from 'lucide-react';

interface SignalPanelProps {
  prediction: ResetPrediction;
  loading?: boolean;
}

const signalIcons: Record<string, typeof MessageSquare> = {
  tibo: MessageSquare,
  status: Server,
  cooldown: Hourglass,
  launch: Megaphone,
};

const statusStyles: Record<string, { badge: string; barColor: string }> = {
  active: { badge: 'bg-success/15 text-success', barColor: 'bg-primary' },
  weak: { badge: 'bg-warning/15 text-warning', barColor: 'bg-warning' },
  idle: { badge: 'bg-muted text-muted-foreground', barColor: 'bg-muted-foreground/50' },
};

export function SignalPanel({ prediction, loading }: SignalPanelProps) {
  const { t } = useI18n();

  const statusTextMap: Record<string, string> = {
    'active': 'ACTIVE',
    'weak': 'WARM',
    'idle': 'IDLE',
  };

  return (
    <section className="bg-card rounded-lg shadow-card p-6" aria-label="Signal radar">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <SatelliteDish className="w-4 h-4 text-primary" />
          {t('signals.title')}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-muted-foreground">
            {prediction.signals.length} sources monitored
          </span>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {prediction.signals.map((signal) => {
          const IconComponent = signalIcons[signal.source] || MessageSquare;
          const style = statusStyles[signal.status] || statusStyles.idle;
          const pct = Math.round(signal.value * 100);

          return (
            <div
              key={signal.label}
              className="bg-muted/50 rounded-lg p-4 border border-border/10 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <IconComponent className="w-4 h-4 text-primary" />
                  {signal.label}
                </div>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {signal.source}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {signal.descriptionParams
                  ? t(signal.description, signal.descriptionParams)
                  : t(signal.description)}
              </p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${style.barColor} ${signal.status === 'active' ? 'signal-glow' : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-mono font-medium ${style.badge}`}>
                  {statusTextMap[signal.status] || signal.status.toUpperCase()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
