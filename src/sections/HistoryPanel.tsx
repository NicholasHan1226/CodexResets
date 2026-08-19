import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import { RESET_HISTORY } from "@/lib/reset-data";

export function HistoryPanel() {
  // Calculate statistics
  const intervals: number[] = [];
  for (let i = 0; i < RESET_HISTORY.length - 1; i++) {
    const diff = (new Date(RESET_HISTORY[i].date).getTime() - new Date(RESET_HISTORY[i + 1].date).getTime()) / (1000 * 60 * 60 * 24);
    if (diff > 0) intervals.push(diff);
  }
  const medianInterval = intervals.length > 0
    ? intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)]
    : 0;
  const maxInterval = intervals.length > 0 ? Math.max(...intervals) : 0;

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <History className="h-4 w-4" />
            RESET HISTORY
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono">
            {RESET_HISTORY.length} events
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {RESET_HISTORY.slice(0, 8).map((event, i) => {
            const interval = i < RESET_HISTORY.length - 1
              ? ((new Date(event.date).getTime() - new Date(RESET_HISTORY[i + 1].date).getTime()) / (1000 * 60 * 60 * 24)).toFixed(1)
              : null;

            return (
              <div
                key={event.date}
                className="flex items-center justify-between rounded-lg border border-border/30 p-2.5 hover:border-border/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-foreground">
                    {new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="text-[11px] text-muted-foreground line-clamp-1 max-w-[140px]">
                    {event.reason}
                  </span>
                </div>
                {interval && (
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {interval}d
                  </Badge>
                )}
              </div>
            );
          })}
        </div>

        {/* Stats summary */}
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-muted/30 p-3">
          <div className="text-center">
            <div className="text-sm font-mono font-bold text-foreground">{RESET_HISTORY.length}</div>
            <div className="text-[10px] text-muted-foreground">Total</div>
          </div>
          <div className="text-center border-x border-border/30">
            <div className="text-sm font-mono font-bold text-foreground">{medianInterval.toFixed(1)}d</div>
            <div className="text-[10px] text-muted-foreground">Median</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-mono font-bold text-foreground">{maxInterval.toFixed(1)}d</div>
            <div className="text-[10px] text-muted-foreground">Max</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
