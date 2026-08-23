import { useEffect, useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { getEffectiveHistory, computeIntervalStats } from '@/lib/reset-data';

export function HistoryPanel() {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const history = getEffectiveHistory();
  const stats = computeIntervalStats();
  const recentResets = history.slice(0, 5);

  // Reset rhythm sparkline: days between consecutive resets (oldest → newest)
  const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const intervals: number[] = [];
  for (let i = history.length - 1; i > 0; i--) {
    const gap = (history[i - 1].timestamp - history[i].timestamp) / 86400000;
    intervals.push(gap);
  }
  const recentIntervals = intervals.slice(-14);
  const maxGap = Math.max(...recentIntervals, 1);
  const sparkline = recentIntervals
    .map((gap) => SPARK_CHARS[Math.min(7, Math.round((gap / maxGap) * 7))])
    .join('');
  // Current ongoing wait
  const currentWait = (now - history[0].timestamp) / 86400000;
  const currentSpark = SPARK_CHARS[Math.min(7, Math.round((currentWait / maxGap) * 7))];

  return (
    <section aria-label="Reset history" className="max-w-4xl">
      <h2 className="text-lg font-semibold text-foreground">
        <span className="mr-2 font-mono font-normal text-primary">❯</span>
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
            // Gap to the reset that FOLLOWED this one (list is newest-first).
            // For the latest reset (i=0) there is no follower yet — hide the gap.
            const nextReset = i > 0 ? history[i - 1] : null;
            const daysSince = nextReset
              ? ((nextReset.timestamp - reset.timestamp) / 86400000).toFixed(1)
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
