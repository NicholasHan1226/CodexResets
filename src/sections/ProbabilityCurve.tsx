import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from "recharts";
import type { ProbabilityPoint } from "@/types/reset";
import { TrendingUp, Clock } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";

interface ProbabilityCurveProps {
  curve: ProbabilityPoint[];
}

export function ProbabilityCurve({ curve }: ProbabilityCurveProps) {
  const { t } = useI18n();
  const now = new Date();
  const nowTimestamp = now.getTime();

  // Group data by date for the chart
  const chartData = curve.map((point) => {
    const pointDate = new Date(point.date);
    pointDate.setUTCHours(point.hour, 0, 0, 0);
    return {
      ...point,
      label: `${point.date.slice(5)} ${String(point.hour).padStart(2, "0")}:00`,
      displayDate: point.date.slice(5),
      timestamp: pointDate.getTime(),
    };
  });

  // Find peak probability
  const peak = chartData.reduce(
    (max, point) => (point.probability > max.probability ? point : max),
    chartData[0]
  );

  // Find the current time position (nearest data point)
  const currentPoint = chartData.reduce((nearest, point) => {
    const dist = Math.abs(point.timestamp - nowTimestamp);
    const nearestDist = Math.abs(nearest.timestamp - nowTimestamp);
    return dist < nearestDist ? point : nearest;
  }, chartData[0]);

  // Check if current time is within the chart range
  const isNowInRange = chartData.some(
    (p) => Math.abs(p.timestamp - nowTimestamp) < 3 * 60 * 60 * 1000
  );

  // Format current time for display
  const nowLabel = now.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            {t("curve.title")}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono">
              {t("curve.peak")}: {Math.round(peak.probability * 100)}%
            </Badge>
            <Badge variant="outline" className="text-xs font-mono text-primary border-primary/30">
              <Clock className="h-3 w-3 mr-1" />
              {nowLabel}
            </Badge>
          </div>
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
              {/* Current time marker */}
              {isNowInRange && (
                <>
                  <ReferenceLine
                    x={currentPoint.displayDate}
                    stroke="#F59E0B"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    strokeOpacity={0.8}
                    label={{
                      value: t("curve.now"),
                      position: "top",
                      fill: "#F59E0B",
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  />
                  <ReferenceDot
                    x={currentPoint.displayDate}
                    y={currentPoint.probability}
                    r={5}
                    fill="#F59E0B"
                    stroke="#0E0F12"
                    strokeWidth={2}
                  />
                </>
              )}
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
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-primary" />
              {t("curve.lowerProb")}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              {t("curve.nowMarker")}
            </span>
          </div>
          <span>{t("curve.higherProb")}</span>
        </div>
      </CardContent>
    </Card>
  );
}
