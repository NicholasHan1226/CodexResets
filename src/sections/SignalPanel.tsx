import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Radio } from "lucide-react";
import type { ResetSignal } from "@/types/reset";

interface SignalPanelProps {
  signals: ResetSignal[];
}

export function SignalPanel({ signals }: SignalPanelProps) {
  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Radio className="h-4 w-4" />
          SIGNAL RADAR
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {signals.map((signal) => (
            <div
              key={signal.source}
              className="rounded-lg border border-border/50 p-3 space-y-2 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground">{signal.label}</span>
                <span
                  className={`h-2 w-2 rounded-full ${
                    signal.status === "active"
                      ? "bg-primary animate-pulse"
                      : signal.status === "weak"
                        ? "bg-amber-500"
                        : "bg-muted-foreground/30"
                  }`}
                />
              </div>
              <div className="text-[11px] text-muted-foreground line-clamp-2">
                {signal.description}
              </div>
              {/* Signal strength bar */}
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    signal.status === "active"
                      ? "bg-primary"
                      : signal.status === "weak"
                        ? "bg-amber-500"
                        : "bg-muted-foreground/20"
                  }`}
                  style={{ width: `${signal.value * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
