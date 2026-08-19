import { useState, useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { RESET_HISTORY, computeIntervalStats } from '@/lib/reset-data';
import type { BankedReset } from '@/types/reset';
import { History, Package, PackageOpen, Plus, Check, Trash2, ExternalLink } from 'lucide-react';

const STORAGE_KEY = 'codex-resets-banked';

export function HistoryBankedPanel() {
  const { t } = useI18n();
  const stats = computeIntervalStats();
  const recentResets = RESET_HISTORY.slice(0, 5);

  // Banked resets state
  const [bankedResets, setBankedResets] = useState<BankedReset[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [issueDate, setIssueDate] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setBankedResets(JSON.parse(stored) as BankedReset[]);
      } catch {
        // ignore
      }
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

    const newReset: BankedReset = {
      id: crypto.randomUUID(),
      issueDate: issue.toISOString(),
      expiryDate: expiry.toISOString(),
      used: false,
    };
    saveResets([newReset, ...bankedResets]);
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
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <section className="bg-card rounded-lg shadow-card p-5" aria-label="Reset history and banked">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <History className="w-4 h-4 text-primary" />
        {t('history.title')}
      </h2>

      {/* Banked Resets */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          {t('banked.title')}
        </span>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
          aria-label={t('banked.add')}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mt-2 flex gap-2 items-end">
          <div className="flex-1">
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full rounded-md bg-muted border-none px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={handleAdd}
            className="shrink-0 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition-all"
          >
            {t('banked.add')}
          </button>
        </div>
      )}

      {/* Banked list */}
      <div className="mt-2 space-y-2">
        {available.length === 0 && !showAdd && (
          <div className="text-xs text-muted-foreground/60 text-center py-1.5">
            {t('banked.empty')}
          </div>
        )}
        {available.map((reset) => {
          const daysLeft = getDaysRemaining(reset.expiryDate);
          const isExpiringSoon = daysLeft <= 5;
          return (
            <div
              key={reset.id}
              className="flex items-center justify-between bg-muted rounded-md px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                {isExpiringSoon ? (
                  <PackageOpen className="w-4 h-4 text-warning shrink-0" />
                ) : (
                  <Package className="w-4 h-4 text-success shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">
                    {new Date(reset.issueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] font-mono ${isExpiringSoon ? 'text-warning' : 'text-muted-foreground'}`}>
                  {daysLeft > 0 ? t('banked.daysLeft', { n: daysLeft }) : t('banked.expired')}
                </span>
                {daysLeft > 0 && (
                  <button
                    onClick={() => handleUse(reset.id)}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    aria-label={t('banked.use')}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => handleRemove(reset.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={t('banked.remove')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div className="my-4 border-t border-border/10" />

      {/* Recent resets */}
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {t('history.recent')}
      </div>
      <div className="mt-2 divide-y divide-border/30">
        {recentResets.map((reset, index) => {
          const nextReset = RESET_HISTORY[RESET_HISTORY.length - 2 - index];
          const daysSince = nextReset
            ? ((new Date(nextReset.timestamp).getTime() - new Date(reset.timestamp).getTime()) / (1000 * 60 * 60 * 24)).toFixed(1)
            : null;

          return (
            <div key={reset.id} className="flex items-center justify-between py-2 group">
              <span className="text-xs font-mono text-foreground">
                {new Date(reset.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              {daysSince && (
                <span className="text-[11px] font-mono text-muted-foreground">
                  {daysSince}d
                </span>
              )}
              <span className="text-[11px] text-muted-foreground truncate max-w-[100px]">
                {reset.reason}
              </span>
              {reset.source && (
                <a
                  href={reset.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom stats */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="bg-muted rounded-md p-2.5 text-center">
          <div className="text-base font-bold font-mono text-foreground">{stats.totalResets}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{t('history.totalResets')}</div>
        </div>
        <div className="bg-muted rounded-md p-2.5 text-center">
          <div className="text-base font-bold font-mono text-primary">{stats.medianDays.toFixed(1)}d</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{t('history.medianInterval')}</div>
        </div>
        <div className="bg-muted rounded-md p-2.5 text-center">
          <div className="text-base font-bold font-mono text-warning">{stats.maxDays.toFixed(1)}d</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{t('history.longestWait')}</div>
        </div>
      </div>
    </section>
  );
}
