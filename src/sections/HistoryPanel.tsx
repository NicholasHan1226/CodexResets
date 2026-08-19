import { useI18n } from '@/contexts/I18nContext';
import { RESET_HISTORY, computeIntervalStats } from '@/lib/reset-data';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History, ExternalLink } from 'lucide-react';

export function HistoryPanel() {
  const { t } = useI18n();
  const stats = computeIntervalStats();
  const recentResets = RESET_HISTORY.slice(0, 8);

  return (
    <Card className="p-5 bg-card border-border/50">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-4 h-4 text-primary" />
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {t('history.title')}
        </h2>
      </div>
      <div className="space-y-2">
        {recentResets.map((reset, index) => {
          const daysSince = index < RESET_HISTORY.length - 1
            ? ((new Date(RESET_HISTORY[RESET_HISTORY.length - 2 - index]?.timestamp || Date.now()).getTime() - new Date(reset.timestamp).getTime()) / (1000 * 60 * 60 * 24)).toFixed(1)
            : null;

          return (
            <div
              key={reset.id}
              className="flex items-center justify-between p-2 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground w-20">
                  {new Date(reset.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
                <span className="text-xs text-foreground truncate max-w-[120px]">
                  {reset.reason}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {daysSince && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {daysSince}d
                  </Badge>
                )}
                {reset.source && (
                  <a
                    href={reset.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-mono font-bold text-primary">{stats.totalResets}</p>
          <p className="text-xs text-muted-foreground">{t('history.totalResets')}</p>
        </div>
        <div>
          <p className="text-lg font-mono font-bold text-foreground">{stats.medianDays.toFixed(1)}d</p>
          <p className="text-xs text-muted-foreground">{t('history.medianInterval')}</p>
        </div>
        <div>
          <p className="text-lg font-mono font-bold text-amber-400">{stats.maxDays.toFixed(1)}d</p>
          <p className="text-xs text-muted-foreground">{t('history.longestWait')}</p>
        </div>
      </div>
    </Card>
  );
}
