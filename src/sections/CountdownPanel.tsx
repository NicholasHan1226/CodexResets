import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PlanningAdvice } from "@/types/reset";
import { Target, Zap, Activity, AlertCircle } from "lucide-react";

interface ResetEstimatePanelProps {
  prob24h: number;
  prob48h: number;
  daysSinceLastReset: number;
  medianIntervalDays: number;
  advice: PlanningAdvice;
  confidence: number;
}

export function ResetEstimatePanel({
  prob24h,
  prob48h,
  daysSinceLastReset,
  medianIntervalDays,
  advice,
  confidence,
}: ResetEstimatePanelProps) {
  const waitRatio = daysSinceLastReset / medianIntervalDays;
  const waitPercent = Math.min(100, waitRatio * 100);
  const prob24Percent = Math.round(prob24h * 100);
  const prob48Percent = Math.round(prob48h * 100);

  // Determine overall signal strength
  const signalStrength = prob24h >= 0.5 ? "strong" : prob24h >= 0.25 ? "moderate" : "weak";

  return (
    <Card className="relative overflow-hidden border-border/50 bg-card">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent pointer-events-none" />

      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Activity className="h-4 w-4" />
            RESET OUTLOOK
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono">
            {signalStrength === "strong" ? "HIGH" : signalStrength === "moderate" ? "MODERATE" : "LOW"} SIGNAL
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Main probability display */}
        <div className="text-center py-2">
          <div className="text-5xl font-mono font-bold text-primary tabular-nums">
            {prob24Percent}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            probability of reset within 24h
          </div>
        </div>

        {/* 48h probability */}
        <div className="flex items-center justify-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">48h:</span>
            <span className="font-mono font-semibold text-foreground">{prob48Percent}%</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Confidence:</span>
            <span className={`font-mono font-semibold ${
              confidence >= 0.6 ? "text-primary" : confidence >= 0.4 ? "text-amber-400" : "text-muted-foreground"
            }`}>
              {Math.round(confidence * 100)}%
            </span>
          </div>
        </div>

        {/* Wait progress */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" />
              Days since last reset
            </span>
            <span className="font-mono text-foreground">
              {daysSinceLastReset.toFixed(1)}d
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
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
            <span>0d</span>
            <span className={waitRatio >= 1 ? "text-primary font-medium" : ""}>
              median: {medianIntervalDays.toFixed(1)}d
            </span>
            <span>{waitRatio >= 1.5 ? "overdue" : waitRatio >= 1 ? "past median" : "building"}</span>
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

        {/* Disclaimer */}
        <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground/70 pt-1 border-t border-border/30">
          <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
          <span>
            Resets are manually triggered by OpenAI and cannot be precisely predicted. 
            This is a probability estimate based on historical patterns and public signals.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
