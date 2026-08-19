import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Gauge } from "lucide-react";

interface ProbabilityGaugesProps {
  prob24h: number;
  prob48h: number;
}

export function ProbabilityGauges({ prob24h, prob48h }: ProbabilityGaugesProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <GaugeCard label="24h Probability" value={prob24h} />
      <GaugeCard label="48h Probability" value={prob48h} />
    </div>
  );
}

function GaugeCard({ label, value }: { label: string; value: number }) {
  const percent = Math.round(value * 100);
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (value * circumference);

  const color =
    value >= 0.5 ? "#10A37F" : value >= 0.25 ? "#F59E0B" : "#8B92A0";

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Gauge className="h-3.5 w-3.5" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        {/* SVG circular gauge */}
        <div className="relative w-24 h-24">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="hsl(220 6% 16%)"
              strokeWidth="6"
            />
            {/* Value arc */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold font-mono text-foreground tabular-nums">
              {percent}
            </span>
            <span className="text-[10px] text-muted-foreground">%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
