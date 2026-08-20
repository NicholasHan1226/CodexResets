import { useI18n } from '@/contexts/I18nContext';
import type { ResetPrediction } from '@/types/reset';
import { Loader2 } from 'lucide-react';

interface SignalPanelProps {
  prediction: ResetPrediction;
  loading?: boolean;
}

const statusTagMap: Record<string, { label: string; className: string }> = {
  active: { label: 'ACTIVE', className: 'text-primary' },
  weak: { label: 'WARM', className: 'text-warning' },
  idle: { label: 'IDLE', className: 'text-muted-foreground/60' },
};

function timeAgo(timestamp: number, locale: string): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (locale === 'zh') {
    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    return `${minutes}分钟前`;
  }
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return `${minutes}m ago`;
}

export function SignalPanel({ prediction, loading }: SignalPanelProps) {
  const { t, locale } = useI18n();

  // Sort signals by updatedAt descending — most recent first
  const sortedSignals = [...prediction.signals].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <section aria-label="Signal radar" className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          {t('signals.title')}
        </h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {prediction.signals.length} sources
          </span>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {/* Timeline feed */}
      <div className="mt-4 space-y-0">
        {sortedSignals.map((signal, i) => {
          const tag = statusTagMap[signal.status] || statusTagMap.idle;
          const desc = signal.descriptionParams
            ? t(signal.description, signal.descriptionParams)
            : t(signal.description);

          return (
            <div
              key={signal.label}
              className={`flex gap-4 py-3 ${i > 0 ? 'border-t border-border/20' : ''}`}
            >
              {/* Timestamp */}
              <span className="shrink-0 w-16 pt-0.5 font-mono text-xs text-muted-foreground/60">
                {timeAgo(signal.updatedAt, locale)}
              </span>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-xs font-medium ${tag.className}`}>
                    {tag.label}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {signal.label}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {desc}
                </p>
                {signal.sourceUrl && (
                  <a
                    href={signal.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block font-mono text-xs text-primary hover:underline"
                  >
                    {signal.source} →
                  </a>
                )}
              </div>

              {/* Signal strength — text-based */}
              <span className="shrink-0 pt-0.5 font-mono text-xs text-muted-foreground/40">
                {Math.round(signal.value * 100)}%
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
