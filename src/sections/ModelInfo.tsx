import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Info, Cpu, BarChart3, Clock } from "lucide-react";

export function ModelInfo() {
  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Info className="h-4 w-4" />
          ABOUT THIS MODEL
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-xs text-muted-foreground">
        <div className="flex items-start gap-3">
          <Cpu className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-foreground font-medium mb-0.5">Signal-Based Prediction</p>
            <p>
              The model aggregates multiple signal sources — API latency anomalies, rate limit pattern shifts,
              community reports, and historical cycle matching — to estimate the probability of an upcoming reset.
            </p>
          </div>
        </div>

        <Separator className="bg-border/50" />

        <div className="flex items-start gap-3">
          <BarChart3 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-foreground font-medium mb-0.5">Probability Curve</p>
            <p>
              The 7-day pulse curve shows the estimated probability of a reset occurring in each 3-hour window.
              Higher peaks indicate more likely reset windows based on historical patterns and current signals.
            </p>
          </div>
        </div>

        <Separator className="bg-border/50" />

        <div className="flex items-start gap-3">
          <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-foreground font-medium mb-0.5">Update Frequency</p>
            <p>
              Predictions refresh every 30 seconds. Signal weights are adjusted based on recent accuracy.
              This is an experimental tool — actual reset times may vary.
            </p>
          </div>
        </div>

        <Separator className="bg-border/50" />

        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
          Disclaimer: This tool is not affiliated with OpenAI. Predictions are based on observed patterns
          and community data. Codex reset schedules are determined solely by OpenAI and may change without notice.
        </p>
      </CardContent>
    </Card>
  );
}
