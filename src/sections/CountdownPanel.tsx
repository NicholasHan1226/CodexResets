import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUTCTime, formatDate } from "@/lib/prediction";
import { Clock, Target } from "lucide-react";

interface CountdownPanelProps {
  countdown: { days: number; hours: number; minutes: number; seconds: number };
  windowStart: string;
  windowEnd: string;
  confidence: number;
}

export function CountdownPanel({ countdown, windowStart, windowEnd, confidence }: CountdownPanelProps) {
  const { days, hours, minutes, seconds } = countdown;
  const confidencePercent = Math.round(confidence * 100);

  const confidenceColor =
    confidence >= 0.6 ? "text-primary" : confidence >= 0.4 ? "text-amber-400" : "text-destructive";

  return (
    <Card className="relative overflow-hidden border-border/50 bg-card">
      {/* Subtle gradient accent */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent pointer-events-none" />

      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Clock className="h-4 w-4" />
            NEXT RESET WINDOW
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono">
            {formatDate(windowStart)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        {/* Countdown digits */}
        <div className="flex items-baseline justify-center gap-1 font-mono">
          {days > 0 && (
            <>
              <TimeBlock value={days} label="d" />
              <span className="text-muted-foreground/50 text-2xl mx-1">:</span>
            </>
          )}
          <TimeBlock value={hours} label="h" />
          <span className="text-muted-foreground/50 text-2xl mx-1">:</span>
          <TimeBlock value={minutes} label="m" />
          <span className="text-muted-foreground/50 text-2xl mx-1">:</span>
          <TimeBlock value={seconds} label="s" />
        </div>

        {/* Window range */}
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <span className="font-mono">{formatUTCTime(windowStart)}</span>
          <span className="text-border">--</span>
          <span className="font-mono">{formatUTCTime(windowEnd)}</span>
          <span className="text-border">UTC</span>
        </div>

        {/* Confidence */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Target className={`h-3.5 w-3.5 ${confidenceColor}`} />
            <span className="text-xs text-muted-foreground">Confidence</span>
          </div>
          <span className={`text-sm font-mono font-semibold ${confidenceColor}`}>
            {confidencePercent}%
          </span>
        </div>

        {/* Confidence bar */}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${confidencePercent}%`,
              background: confidence >= 0.6
                ? "linear-gradient(90deg, hsl(162 82% 35%), hsl(162 82% 45%))"
                : confidence >= 0.4
                  ? "linear-gradient(90deg, hsl(38 92% 50%), hsl(38 92% 60%))"
                  : "linear-gradient(90deg, hsl(17 94% 57%), hsl(17 94% 67%))",
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function TimeBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-4xl font-bold tracking-tight text-foreground tabular-nums">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
        {label}
      </span>
    </div>
  );
}
