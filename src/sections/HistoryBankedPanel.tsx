import { useState, useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { RESET_HISTORY, computeIntervalStats } from '@/lib/reset-data';
import type { BankedReset } from '@/types/reset';

const STORAGE_KEY = 'codex-resets-banked';

export function HistoryBankedPanel() {
  const { t, locale } = useI18n();
  const stats = computeIntervalStats();
  const recentResets = RESET_HISTORY.slice(0, 5);

  const [bankedResets, setBankedResets] = useState<BankedReset[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [issueDate, setIssueDate] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setBankedResets(JSON.parse(stored) as BankedReset[]); } catch { /* ignore */ }
    }
  }, []);

  const saveResets = (newResets: BankedReset[]) => {
    setBankedResets(newResets);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newResets));
  };

  const handleAdd = () => {
    if (!issueDate) return;
    const issue = new Date(issueDate);
    const expiry = new Date(issue);
    expiry.setDate(expiry.getDate() + 30);
    saveResets([{
      id: crypto.randomUUID(),
      issueDate: issue.toISOString(),
      expiryDate: expiry.toISOString(),
      used: false,
    }, ...bankedResets]);
    setIssueDate('');
    setShowAdd(false);
  };

  const handleUse = (id: string) => {
    saveResets(bankedResets.map((r) => (r.id === id ? { ...r, used: true } : r)));
  };

  const handleRemove = (id: string) => {
    saveResets(bankedResets.filter((r) => r.id !== id));
  };

  const available = bankedResets.filter((r) => !r.used);
  const getDaysRemaining = (expiryDate: string) => {
    const diff = new Date(expiryDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  };

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
    <section aria-label="Reset history and banked" className="max-w-3xl">
      <h2 className="text-lg font-semibold text-foreground">
        {t('history.title')}
      </h2>

      {/* Banked resets */}
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            {t('banked.title')}
          </span>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="font-mono text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            [{showAdd ? '−' : '+'}]
          </button>
        </div>

        {showAdd && (
          <div className="mt-2 flex gap-2 items-center">
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="bg-muted border border-border/20 rounded-md px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-primary/40"
            />
            <button
              onClick={handleAdd}
              className="font-mono text-xs text-primary hover:underline"
            >
              [{t('banked.add')}]
            </button>
          </div>
        )}

        <div className="mt-2 space-y-1">
          {available.length === 0 && !showAdd && (
            <p className="text-xs text-muted-foreground/50">{t('banked.empty')}</p>
          )}
          {available.map((reset) => {
            const daysLeft = getDaysRemaining(reset.expiryDate);
            const isExpiringSoon = daysLeft <= 5;
            return (
              <div key={reset.id} className="flex items-center justify-between text-sm">
                <span className="font-mono text-foreground">
                  {new Date(reset.issueDate).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}
                </span>
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-xs ${isExpiringSoon ? 'text-warning' : 'text-muted-foreground'}`}>
                    {daysLeft > 0 ? t('banked.daysLeft', { n: daysLeft }) : t('banked.expired')}
                  </span>
                  {daysLeft > 0 && (
                    <button
                      onClick={() => handleUse(reset.id)}
                      className="font-mono text-xs text-muted-foreground hover:text-primary"
                    >
                      [use]
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(reset.id)}
                    className="font-mono text-xs text-muted-foreground/40 hover:text-destructive"
                  >
                    [×]
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reset rhythm sparkline */}
      <div className="mt-5">
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
