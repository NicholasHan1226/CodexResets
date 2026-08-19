import { useI18n } from "@/contexts/I18nContext";
import { BarChart3 } from "lucide-react";
import { RESET_HISTORY } from "@/lib/reset-data";

export function TimeDistribution() {
  const { t } = useI18n();
  // Build hourly distribution from reset history
  const hourlyCounts = new Array(24).fill(0);
  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  RESET_HISTORY.forEach((event) => {
    const hour = new Date(event.timestamp).getHours();
    hourlyCounts[hour]++;
  });

  const maxCount = Math.max(...hourlyCounts);

  // Find peak window (3-hour range with most events)
  let bestStart = 0;
  let bestCount = 0;
  for (let i = 0; i < 24; i++) {
    const count = hourlyCounts[i] + hourlyCounts[(i + 1) % 24] + hourlyCounts[(i + 2) % 24];
    if (count > bestCount) {
      bestCount = count;
      bestStart = i;
    }
  }

  return (
    <section className="bg-card rounded-lg shadow-card p-6" aria-label="Hourly distribution">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <BarChart3 className="w-4 h-4 text-primary" />
          {t('timeDistribution.title')}
        </h2>
        <span className="text-[11px] text-muted-foreground font-mono">{userTz}</span>
      </div>

      {/* Bar chart */}
      <div className="mt-5 flex items-end gap-1 h-44">
        {hourlyCounts.map((count, hour) => {
          const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
          const isPeak = hour >= bestStart && hour <= bestStart + 2;
          return (
            <div
              key={hour}
              className="group flex-1 rounded-t-md relative cursor-default"
              style={{ height: "100%" }}
            >
              <div
                className={`absolute bottom-0 left-0 right-0 rounded-t-md transition-all duration-300 ${
                  isPeak
                    ? "bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.3)]"
                    : count > 0
                      ? "bg-primary/25 group-hover:bg-primary/40"
                      : "bg-muted group-hover:bg-muted-foreground/20"
                }`}
                style={{ height: `${Math.max(3, height)}%` }}
                title={`${String(hour).padStart(2, "0")}:00 — ${count} ${t('timeDistribution.resets')}`}
              />
            </div>
          );
        })}
      </div>

      {/* Hour labels */}
      <div className="flex justify-between text-[11px] text-muted-foreground font-mono mt-2">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>

      {/* Peak window info */}
      <div className="mt-4 flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3 border border-border/10">
        <div className="w-2 h-2 rounded-full bg-primary shrink-0 signal-glow" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-muted-foreground">{t('timeDistribution.peakWindow')}</div>
          <div className="text-sm font-mono font-semibold text-foreground mt-0.5">
            {String(bestStart).padStart(2, "0")}:00 – {String((bestStart + 3) % 24).padStart(2, "0")}:00
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-mono font-bold text-primary">
            {Math.round((bestCount / RESET_HISTORY.length) * 100)}%
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t('timeDistribution.peakInfo', { count: bestCount, total: RESET_HISTORY.length, percent: Math.round((bestCount / RESET_HISTORY.length) * 100) }).split('·')[0]}
          </div>
        </div>
      </div>
    </section>
  );
}
