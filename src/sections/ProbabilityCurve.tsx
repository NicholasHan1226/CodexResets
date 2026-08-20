import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from "recharts";
import type { ProbabilityPoint } from "@/types/reset";
import { useI18n } from "@/contexts/I18nContext";

interface ProbabilityCurveProps {
  curve: ProbabilityPoint[];
  /** When set, only show points within the next N hours from now */
  hours?: number;
}

export function ProbabilityCurve({ curve, hours }: ProbabilityCurveProps) {
  const { t } = useI18n();

  // Ticking clock so the NOW marker and displayed time stay live
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const nowTimestamp = now.getTime();

  // Current UTC time (chart data is UTC-based)
  const nowUtcLabel = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")} UTC`;

  // Group data by date for the chart
  const allData = curve.map((point) => {
    const pointDate = new Date(point.date);
    pointDate.setUTCHours(point.hour, 0, 0, 0);
    return {
      ...point,
      label: `${point.date.slice(5)} ${String(point.hour).padStart(2, "0")}:00`,
      displayDate: point.date.slice(5),
      timestamp: pointDate.getTime(),
    };
  });

  // Filter to the selected window (include 2h of history so NOW marker has context)
  const chartData = hours
    ? allData.filter(
        (p) =>
          p.timestamp >= nowTimestamp - 2 * 60 * 60 * 1000 &&
          p.timestamp <= nowTimestamp + hours * 60 * 60 * 1000
      )
    : allData;

  // Find peak probability within the visible range
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

  return (
    <section aria-label="Probability curve" className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          {t("curve.title")}
          {hours && (
            <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
              next {hours}h
            </span>
          )}
        </h2>
        <span className="font-mono text-xs text-muted-foreground">
          <span className="text-foreground/80">{nowUtcLabel}</span>
          <span className="mx-2 text-border">·</span>
          {t("curve.peak")}: {Math.round(peak.probability * 100)}%
        </span>
      </div>
      <div className="mt-4">
        <div className="h-40 sm:h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="probGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10A37F" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10A37F" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#7C8494" }}
                tickLine={false}
                axisLine={{ stroke: "#26272E" }}
                interval={Math.max(1, Math.floor(chartData.length / 7))}
                tickFormatter={(v: string) => (hours ? v.slice(6) : v.slice(0, 5))}
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
                    x={currentPoint.label}
                    stroke="#F0F2F5"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                    label={{
                      value: `${t("curve.now")} ${nowUtcLabel}`,
                      position: "insideTopRight",
                      fill: "#F0F2F5",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  />
                  <ReferenceDot
                    x={currentPoint.label}
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
                animationDuration={800}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Legend — inline text */}
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          <span className="text-primary">—</span> {t("curve.lowerProb")}
          <span className="mx-2 text-border">·</span>
          <span className="text-foreground/60">┆</span> {t("curve.nowMarker")}
          <span className="mx-2 text-border">·</span>
          {t("curve.peak")} {Math.round(peak.probability * 100)}%
        </p>
      </div>
    </section>
  );
}
