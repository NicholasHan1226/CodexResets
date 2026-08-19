import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { HistoricalReset } from "@/types/reset";
import { History, ArrowRight } from "lucide-react";

interface HistoryPanelProps {
  resets: HistoricalReset[];
}

export function HistoryPanel({ resets }: HistoryPanelProps) {
  const avgInterval = resets
    .filter((r) => r.intervalHours !== null)
    .reduce((sum, r) => sum + (r.intervalHours ?? 0), 0) /
    resets.filter((r) => r.intervalHours !== null).length;

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <History className="h-4 w-4" />
            RESET HISTORY
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono">
            Avg: {Math.round(avgInterval)}h
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-0">
          {resets.slice(0, 8).map((reset, index) => (
            <div key={reset.time}>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-foreground">
                    {new Date(reset.time).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {reset.dayOfWeek}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    {new Date(reset.time).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                      timeZone: "UTC",
                    })}
                  </span>
                  {reset.intervalHours && (
                    <>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                      <span className="text-xs font-mono text-muted-foreground">
                        {reset.intervalHours}h
                      </span>
                    </>
                  )}
                </div>
              </div>
              {index < 7 && <Separator className="bg-border/50" />}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
