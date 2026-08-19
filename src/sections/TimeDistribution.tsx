import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { RESET_HISTORY } from "@/lib/reset-data";

export function TimeDistribution() {
  // Build hourly distribution from reset history
  const hourlyCounts = new Array(24).fill(0);
  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  RESET_HISTORY.forEach((event) => {
    const hour = new Date(event.date).getHours();
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
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <BarChart3 className="h-4 w-4" />
            RESET TIME DISTRIBUTION
          </CardTitle>
          <span className="text-[10px] text-muted-foreground font-mono">{userTz}</span>
        </div>
      </CardHeader>
      <CardContent>
        {/* Bar chart */}
        <div className="flex items-end gap-[2px] h-20 mb-3">
          {hourlyCounts.map((count, hour) => {
            const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const isPeak = hour >= bestStart && hour <= (bestStart + 2) % 24;
            return (
              <div
                key={hour}
                className="flex-1 rounded-t transition-all"
                style={{
                  height: `${Math.max(4, height)}%`,
                  background: isPeak
                    ? "linear-gradient(to top, hsl(162 82% 35%), hsl(162 82% 50%))"
                    : count > 0
                      ? "hsl(var(--muted-foreground) / 0.3)"
                      : "hsl(var(--muted) / 0.5)",
                }}
                title={`${String(hour).padStart(2, "0")}:00 — ${count} resets`}
              />
            );
          })}
        </div>

        {/* Hour labels */}
        <div className="flex justify-between text-[9px] text-muted-foreground font-mono mb-3">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>23</span>
        </div>

        {/* Peak window info */}
        <div className="rounded-lg bg-muted/30 p-2.5">
          <div className="text-[11px] text-muted-foreground mb-1">Peak window</div>
          <div className="text-sm font-mono font-semibold text-foreground">
            {String(bestStart).padStart(2, "0")}:00 – {String((bestStart + 3) % 24).padStart(2, "0")}:00
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {bestCount} of {RESET_HISTORY.length} resets ({Math.round((bestCount / RESET_HISTORY.length) * 100)}%) fall in this window
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
