import { useI18n } from "@/contexts/I18nContext";
import { RESET_HISTORY } from "@/lib/reset-data";

export function TimeDistribution() {
  const { t } = useI18n();
  const hourlyCounts = new Array(24).fill(0);
  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  RESET_HISTORY.forEach((event) => {
    const hour = new Date(event.timestamp).getHours();
    hourlyCounts[hour]++;
  });

  const maxCount = Math.max(...hourlyCounts);

  // Find peak 3-hour window
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
    <section aria-label="Hourly distribution" className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          <span className="mr-2 font-mono font-normal text-primary">❯</span>
          {t('timeDistribution.title')}
        </h2>
        <span className="font-mono text-xs text-muted-foreground">{userTz}</span>
      </div>

      {/* Bar chart */}
      <div className="mt-4 flex items-end gap-[2px] sm:gap-[3px] h-24 sm:h-32">
        {hourlyCounts.map((count, hour) => {
          const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
          const isPeak = hour >= bestStart && hour <= bestStart + 2;
          return (
            <div key={hour} className="flex-1 relative" style={{ height: "100%" }}>
              <div
                className={`absolute bottom-0 left-0 right-0 rounded-t-sm transition-colors ${
                  isPeak
                    ? "bg-primary"
                    : count > 0
                      ? "bg-primary/25 hover:bg-primary/40"
                      : "bg-muted/60 hover:bg-muted"
                }`}
                style={{ height: `${Math.max(2, height)}%` }}
                title={`${String(hour).padStart(2, "0")}:00 — ${count} ${t('timeDistribution.resets')}`}
              />
            </div>
          );
        })}
      </div>

      {/* Hour labels */}
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground/50 mt-1">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>

      {/* Peak window — inline text */}
      <p className="mt-3 text-sm text-muted-foreground">
        {t('timeDistribution.peakWindow')}:{" "}
        <span className="font-mono text-foreground">
          {String(bestStart).padStart(2, "0")}:00 – {String((bestStart + 3) % 24).padStart(2, "0")}:00
        </span>
        <span className="mx-2 text-border">·</span>
        <span className="font-mono text-primary">
          {Math.round((bestCount / RESET_HISTORY.length) * 100)}%
        </span>{" "}
        {t('timeDistribution.resets').toLowerCase()}
      </p>
    </section>
  );
}
