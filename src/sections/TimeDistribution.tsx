import { useI18n } from "@/contexts/I18nContext";
import { getEffectiveHistory } from "@/lib/reset-data";
import { isPeakHour } from "@/lib/time-window";

export function TimeDistribution() {
  const { t } = useI18n();
  const history = getEffectiveHistory();
  const hourlyCounts = new Array(24).fill(0);
  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  history.forEach((event) => {
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
    <section aria-label="Hourly distribution" className="max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          <span className="mr-2 font-mono font-normal text-primary">❯</span>
          {t('timeDistribution.title')}
        </h2>
        <span className="font-mono text-xs text-muted-foreground">{userTz}</span>
      </div>

      {/* Bar chart */}
      <div
        className="mt-4 flex h-24 items-end gap-[2px] sm:h-32 sm:gap-[3px]"
        role="img"
        aria-label={`${t('timeDistribution.title')}: ${String(bestStart).padStart(2, '0')}:00–${String((bestStart + 3) % 24).padStart(2, '0')}:00 ${t('timeDistribution.peakWindow')}`}
      >
        {hourlyCounts.map((count, hour) => {
          const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
          // The peak window may cross midnight (for example 23:00–02:00).
          const isPeak = isPeakHour(hour, bestStart);
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
                aria-hidden="true"
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
          {bestCount}/{history.length}
        </span>{" "}
        {t('timeDistribution.resets')}
      </p>
    </section>
  );
}
