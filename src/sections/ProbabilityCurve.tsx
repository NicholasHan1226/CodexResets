import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from "recharts";
import type { ProbabilityPoint } from "@/types/reset";
import { useI18n } from "@/contexts/I18nContext";

interface ProbabilityCurveProps {
  curve: ProbabilityPoint[];
  /** When set, only show points within the next N hours from now */
  hours?: number;
}

const HOUR = 3600 * 1000;
const MONO = "IBM Plex Mono, monospace";

export function ProbabilityCurve({ curve, hours }: ProbabilityCurveProps) {
  const { t } = useI18n();

  // Ticking clock — the NOW marker glides along the curve in real time
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const nowTimestamp = now.getTime();
  const nowUtcLabel = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")} UTC`;

  const allData = curve.map((point) => {
    const pointDate = new Date(point.date);
    pointDate.setUTCHours(point.hour, 0, 0, 0);
    return { ...point, timestamp: pointDate.getTime() };
  });

  // Filter to the selected window (include 2h of history so NOW has context)
  const chartData = hours
    ? allData.filter(
        (p) => p.timestamp >= nowTimestamp - 2 * HOUR && p.timestamp <= nowTimestamp + hours * HOUR
      )
    : allData;

  if (chartData.length === 0) return null;

  const peak = chartData.reduce(
    (max, point) => (point.probability > max.probability ? point : max),
    chartData[0]
  );

  const minTs = chartData[0].timestamp;
  const maxTs = chartData[chartData.length - 1].timestamp;
  const isNowInRange = nowTimestamp >= minTs && nowTimestamp <= maxTs;

  // Interpolated probability at the exact current moment — the dot sits on the curve
  const probAtNow = (() => {
    if (!isNowInRange) return 0;
    const nextIdx = chartData.findIndex((p) => p.timestamp >= nowTimestamp);
    if (nextIdx <= 0) return chartData[0].probability;
    const a = chartData[nextIdx - 1];
    const b = chartData[nextIdx];
    const ratio = (nowTimestamp - a.timestamp) / (b.timestamp - a.timestamp);
    return a.probability + (b.probability - a.probability) * ratio;
  })();

  // Round-hour ticks: 6h step for 24h view, 12h for 48h, daily for full curve
  const range = maxTs - minTs;
  const step = range <= 26 * HOUR ? 6 * HOUR : range <= 50 * HOUR ? 12 * HOUR : 24 * HOUR;
  const xTicks: number[] = [];
  for (let ts = Math.ceil(minTs / step) * step; ts <= maxTs; ts += step) xTicks.push(ts);

  const formatXTick = (ts: number) => {
    const d = new Date(ts);
    return hours
      ? `${String(d.getUTCHours()).padStart(2, "0")}:00`
      : `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };

  // One decimal when needed — avoids duplicate rounded ticks like "2% / 2%"
  const formatPctTick = (v: number) => {
    const p = v * 100;
    return `${Number.isInteger(p) ? p.toFixed(0) : p.toFixed(1)}%`;
  };

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
                type="number"
                dataKey="timestamp"
                domain={[minTs, maxTs]}
                ticks={xTicks}
                tickFormatter={formatXTick}
                tick={{ fontSize: 11, fill: "#7C8494", fontFamily: MONO }}
                tickLine={false}
                axisLine={{ stroke: "#26272E" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#7C8494", fontFamily: MONO }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatPctTick}
                domain={[0, "auto"]}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const data = payload[0].payload as ProbabilityPoint;
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
              {/* NOW — exact current-time position, moves with the ticking clock */}
              {isNowInRange && (
                <>
                  <ReferenceLine
                    x={nowTimestamp}
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
                      fontFamily: MONO,
                    }}
                  />
                  <ReferenceDot
                    x={nowTimestamp}
                    y={probAtNow}
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
      </div>
    </section>
  );
}
