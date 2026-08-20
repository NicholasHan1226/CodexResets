import { useI18n } from '@/contexts/I18nContext';
import { RESET_HISTORY, computeIntervalStats } from '@/lib/reset-data';

export function HistoryPanel() {
  const { t, locale } = useI18n();
  const stats = computeIntervalStats();
  const recentResets = RESET_HISTORY.slice(0, 5);

  // Reset rhythm sparkline: days between consecutive resets (oldest → newest)
  const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const intervals: number[] = [];
  for (let i = RESET_HISTORY.length - 1; i > 0; i--) {
    const gap = (RESET_HISTORY[i - 1].timestamp - RESET_HISTORY[i].timestamp) / 86400000;
    intervals.push(gap);
  }
  const recentIntervals = intervals.slice(-14);
  const maxGap = Math.max(...recentIntervals, 1);
  const sparkline = recentIntervals
    .map((gap) => SPARK_CHARS[Math.min(7, Math.round((gap / maxGap) * 7))])
    .join('');
  // Current ongoing wait
  const currentWait = (Date.now() - RESET_HISTORY[0].timestamp) / 86400000;
  const currentSpark = SPARK_CHARS[Math.min(7, Math.round((currentWait / maxGap) * 7))];

  return (
    <section aria-label="Reset history" className="max-w-3xl">
      <h2 className="text-lg font-semibold text-foreground">
        {t('history.title')}
      </h2>

      {/* Reset rhythm sparkline */}
      <div className="mt-3">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">
          {t('history.rhythm')}
        </span>
        <p className="mt-1.5 font-mono text-lg tracking-wider select-none" aria-hidden="true">
          <span className="text-muted-foreground">{sparkline}</span>
          <span className="text-primary" title={`current: ${currentWait.toFixed(1)}d`}>{currentSpark}</span>
        </p>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground/60">
          {t('history.rhythmNote')} · {t('history.currentWait')}{' '}
          <span className="text-primary">{currentWait.toFixed(1)}d</span>
        </p>
      </div>

      {/* Recent resets — timeline */}
      <div className="mt-6">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">
          {t('history.recent')}
        </span>
        <div className="mt-2 space-y-0">
          {recentResets.map((reset, i) => {
            const nextReset = RESET_HISTORY[RESET_HISTORY.length - 2 - i];
            const daysSince = nextReset
              ? ((new Date(nextReset.timestamp).getTime() - new Date(reset.timestamp).getTime()) / 86400000).toFixed(1)
              : null;
            return (
              <div
                key={reset.id}
                className={`flex items-baseline gap-3 py-1.5 ${i > 0 ? 'border-t border-border/10' : ''}`}
              >
                <span className="shrink-0 font-mono text-sm text-foreground">
                  {new Date(reset.timestamp).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}
                </span>
                {daysSince && (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground/60">
                    +{daysSince}d
                  </span>
                )}
                <span className="text-sm text-muted-foreground truncate">
                  {reset.reason}
                </span>
                {reset.source && (
                  <a
                    href={reset.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 font-mono text-xs text-primary hover:underline ml-auto"
                  >
                    src →
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats — inline */}
      <p className="mt-4 font-mono text-xs text-muted-foreground">
        <span className="text-foreground">{stats.totalResets}</span> {t('history.totalResets').toLowerCase()}
        <span className="mx-2 text-border">·</span>
        <span className="text-primary">{stats.medianDays.toFixed(1)}d</span> {t('history.medianInterval').toLowerCase()}
        <span className="mx-2 text-border">·</span>
        <span className="text-warning">{stats.maxDays.toFixed(1)}d</span> {t('history.longestWait').toLowerCase()}
      </p>
    </section>
  );
}

export default HistoryPanel;
