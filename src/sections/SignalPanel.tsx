import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { ResetSignal } from "@/types/reset";
import { RadioTower } from "lucide-react";

interface SignalPanelProps {
  signals: ResetSignal[];
}

export function SignalPanel({ signals }: SignalPanelProps) {
  const activeCount = signals.filter((s) => s.status === "active").length;

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <RadioTower className="h-4 w-4" />
            SIGNAL MONITOR
          </CardTitle>
          <Badge variant={activeCount > 2 ? "default" : "secondary"} className="text-xs">
            {activeCount}/{signals.length} active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {signals.map((signal) => (
          <SignalRow key={signal.source} signal={signal} />
        ))}
      </CardContent>
    </Card>
  );
}

function SignalRow({ signal }: { signal: ResetSignal }) {
  const statusColor =
    signal.status === "active"
      ? "bg-primary"
      : signal.status === "weak"
        ? "bg-amber-400"
        : "bg-muted-foreground/30";

  const timeAgo = Math.floor((Date.now() - signal.updatedAt) / 1000);
  const timeAgoLabel = timeAgo < 60 ? `${timeAgo}s` : `${Math.floor(timeAgo / 60)}m`;

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />
          <span className="text-xs text-foreground">{signal.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground">{timeAgoLabel} ago</span>
          <span className="text-xs font-mono text-muted-foreground w-8 text-right">
            {Math.round(signal.value * 100)}%
          </span>
        </div>
      </div>
      <Progress value={signal.value * 100} className="h-1" />
    </div>
  );
}
