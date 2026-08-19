import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { ProbabilityPoint } from "@/types/reset";
import { TrendingUp } from "lucide-react";

interface ProbabilityCurveProps {
  curve: ProbabilityPoint[];
}

export function ProbabilityCurve({ curve }: ProbabilityCurveProps) {
  // Group data by date for the chart
  const chartData = curve.map((point) => ({
    ...point,
    label: `${point.date.slice(5)} ${String(point.hour).padStart(2, "0")}:00`,
    displayDate: point.date.slice(5),
  }));

  // Find peak probability
  const peak = chartData.reduce(
    (max, point) => (point.probability > max.probability ? point : max),
    chartData[0]
  );

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            7-DAY PROBABILITY PULSE
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono">
            Peak: {Math.round(peak.probability * 100)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="probGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10A37F" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10A37F" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 10, fill: "#8B92A0" }}
                tickLine={false}
                axisLine={{ stroke: "#1A1B21" }}
                interval={Math.floor(chartData.length / 7)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#8B92A0" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                domain={[0, "auto"]}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-lg">
                      <p className="text-xs text-muted-foreground">
                        {data.date} {String(data.hour).padStart(2, "0")}:00 UTC
                      </p>
                      <p className="text-sm font-mono font-semibold text-primary">
                        {Math.round(data.probability * 100)}%
                      </p>
                    </div>
                  );
                }}
              />
              <ReferenceLine
                y={peak.probability}
                stroke="#10A37F"
                strokeDasharray="3 3"
                strokeOpacity={0.4}
              />
              <Area
                type="monotone"
                dataKey="probability"
                stroke="#10A37F"
                strokeWidth={2}
                fill="url(#probGradient)"
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Lower probability = unlikely reset window</span>
          <span>Higher probability = likely reset window</span>
        </div>
      </CardContent>
    </Card>
  );
}
