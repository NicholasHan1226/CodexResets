import { useI18n } from '@/contexts/I18nContext';
import type { ResetPrediction } from '@/types/reset';
import { Loader2 } from 'lucide-react';

interface SignalPanelProps {
  prediction: ResetPrediction;
  loading?: boolean;
}

/**
 * Terminal reverse-video status badges: ACTIVE/WARM pop as inverted blocks,
 * IDLE stays plain dim text — inactive things should not compete for attention.
 */
const statusTagMap: Record<string, { label: string; badge: string }> = {
  active: { label: 'ACTIVE', badge: 'bg-primary text-background' },
  weak: { label: 'WARM', badge: 'bg-warning text-background' },
  idle: { label: 'IDLE', badge: 'text-muted-foreground/60' },
};

const statusWeight: Record<string, number> = { active: 0, weak: 1, idle: 2 };

// Worker labels are stable source identifiers in English. Keep them as a
// fallback, but resolve known sources in the visitor's selected language.
const signalLabelKeys: Record<string, string> = {
  tibopost: 'signals.tibo',
  status_page: 'signals.status',
  cooldown: 'signals.cooldown',
};

// Public snapshots omit article URLs; these are source entry points, not evidence for a specific post.
const publicSourceUrls: Record<string, string> = {
  tibopost: 'https://x.com/thsottiaux',
  status_page: 'https://status.openai.com/history',
};

function timeAgo(timestamp: number, locale: string): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (locale === 'zh') {
    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return '刚刚';
  }
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function SignalPanel({ prediction, loading }: SignalPanelProps) {
  const { t, locale } = useI18n();

  // Radar ordering: severity first (ACTIVE > WARM > IDLE), recency within tier
  const sortedSignals = [...prediction.signals].sort(
    (a, b) => (statusWeight[a.status] ?? 3) - (statusWeight[b.status] ?? 3) || b.updatedAt - a.updatedAt
  );

  const total = prediction.signals.length;

  return (
    <section aria-label="Signal radar" className="max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          <span className="mr-2 font-mono font-normal text-primary">❯</span>
          {t('signals.title')}
        </h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {t('signals.sources', { n: total })}
          </span>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {/* Timeline feed */}
      <div className="mt-3 space-y-0">
        {sortedSignals.map((signal, i) => {
          const tag = statusTagMap[signal.status] || statusTagMap.idle;
          const labelKey = signalLabelKeys[signal.source];
          const sourceUrl = signal.sourceUrl && /^https:\/\//i.test(signal.sourceUrl)
            ? signal.sourceUrl : publicSourceUrls[signal.source];

          return (
            <div
              key={signal.label}
              className={`flex gap-4 py-3 transition-colors ${i > 0 ? 'border-t border-border/20' : ''} ${
                signal.status === 'active' ? '-mx-2 bg-primary/5 px-2' : ''
              }`}
            >
              {/* Timestamp */}
              <span className="shrink-0 w-16 pt-0.5 font-mono text-xs text-muted-foreground/60">
                {timeAgo(signal.updatedAt, locale)}
              </span>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-px font-mono text-[10px] font-semibold tracking-wider ${tag.badge}`}>
                    {tag.label}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {labelKey ? t(labelKey) : signal.label}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t(signal.description, signal.descriptionParams)}
                </p>
                {sourceUrl && (
                  <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center text-xs text-primary underline underline-offset-4">
                    {t('signals.viewSource')}
                  </a>
                )}
              </div>

            </div>
          );
        })}
      </div>
    </section>
  );
}
