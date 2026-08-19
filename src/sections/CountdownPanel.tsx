import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatWindowDate } from "@/lib/prediction";
import type { PlanningAdvice } from "@/types/reset";
import { Clock, Target, Zap, Calendar } from "lucide-react";

interface ResetEstimatePanelProps {
  countdown: { days: number; hours: number; minutes: number; seconds: number };
  windowStart: string;
  windowEnd: string;
  confidence: number;
  prob24h: number;
  prob48h: number;
  daysSinceLastReset: number;
  medianIntervalDays: number;
  advice: PlanningAdvice;
}

export function ResetEstimatePanel({
  countdown,
  windowStart,
  windowEnd,
  confidence,
  prob24h,
  prob48h,
  daysSinceLastReset,
  medianIntervalDays,
  advice,
}: ResetEstimatePanelProps) {
  const { days, hours, minutes, seconds } = countdown;
  const confidencePercent = Math.round(confidence * 100);
  const waitRatio = daysSinceLastReset / medianIntervalDays;
  const waitPercent = Math.min(100, waitRatio * 100);


  return (
    <Card className="relative overflow-hidden border-border/50 bg-card">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent pointer-events-none" />

      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Clock className="h-4 w-4" />
            NEXT RESET WINDOW
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono">
            {formatWindowDate(windowStart).split(" ").slice(0, 2).join(" ")}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Predicted window */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span className="font-mono">{formatWindowDate(windowStart)}</span>
          <span className="text-border">→</span>
          <span className="font-mono">{formatWindowDate(windowEnd)}</span>
        </div>

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

        {/* Probability gauges inline */}
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center rounded-lg bg-muted/30 p-2">
            <div className="text-lg font-mono font-bold text-primary">{Math.round(prob24h * 100)}%</div>
            <div className="text-[10px] text-muted-foreground">24h</div>
          </div>
          <div className="text-center rounded-lg bg-muted/30 p-2">
            <div className="text-lg font-mono font-bold text-primary">{Math.round(prob48h * 100)}%</div>
            <div className="text-[10px] text-muted-foreground">48h</div>
          </div>
        </div>

        {/* Wait progress */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" />
              Wait progress
            </span>
            <span className="font-mono text-foreground">
              {daysSinceLastReset.toFixed(1)}d / {medianIntervalDays.toFixed(1)}d
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${waitPercent}%`,
                background: waitRatio >= 1.2
                  ? "linear-gradient(90deg, hsl(162 82% 35%), hsl(162 82% 50%))"
                  : waitRatio >= 0.8
                    ? "linear-gradient(90deg, hsl(38 92% 50%), hsl(38 92% 60%))"
                    : "linear-gradient(90deg, hsl(var(--muted-foreground) / 0.3), hsl(var(--muted-foreground) / 0.5))",
              }}
            />
          </div>
        </div>

        {/* Planning advice */}
        <div className={`flex items-start gap-2 rounded-lg border p-3 ${
          advice.level === "wait"
            ? "border-primary/30 bg-primary/5"
            : advice.level === "cautious"
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-border/50 bg-muted/20"
        }`}>
          <Zap className={`h-4 w-4 mt-0.5 shrink-0 ${advice.color}`} />
          <div>
            <div className={`text-xs font-medium ${advice.color}`}>
              {advice.level === "wait" ? "Recommend waiting" : advice.level === "cautious" ? "Use cautiously" : advice.level === "use_freely" ? "Normal conditions" : "Critical — wait"}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{advice.text}</div>
          </div>
        </div>

        {/* Confidence */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Confidence</span>
          <span className={`text-sm font-mono font-semibold ${
            confidence >= 0.6 ? "text-primary" : confidence >= 0.4 ? "text-amber-400" : "text-muted-foreground"
          }`}>
            {confidencePercent}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function TimeBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[10px] text-muted-foreground mt-0.5">{label}</span>
    </div>
  );
}
