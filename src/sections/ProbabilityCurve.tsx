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
    <Card className="border-border/10 bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <TrendingUp className="h-4 w-4 text-primary" />
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
        <div className="h-56 w-full">
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
                tick={{ fontSize: 11, fill: "#7C8494" }}
                tickLine={false}
                axisLine={{ stroke: "#26272E" }}
                interval={Math.floor(chartData.length / 7)}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#7C8494" }}
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
                    stroke="#F0F2F5"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                    label={{
                      value: t("curve.now"),
                      position: "top",
                      fill: "#F0F2F5",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  />
                  <ReferenceDot
                    x={currentPoint.displayDate}
                    y={currentPoint.probability}
                    r={5}
                    fill="#10A37F"
                    stroke="#0B0C0F"
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
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary" />
            {t("curve.lowerProb")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-px h-3 bg-foreground/60" />
            {t("curve.nowMarker")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary" />
            {t("curve.peak")} {Math.round(peak.probability * 100)}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
