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

/** Pill-shaped label pinned to the top of the NOW reference line */
function NowLabel(props: { viewBox?: unknown; text?: string }) {
  const { viewBox, text = "" } = props;
  const box = viewBox as { x: number; y: number } | undefined;
  if (!box) return null;
  const { x, y } = box;
  const w = 84;
  const h = 18;
  return (
    <g transform={`translate(${x - w / 2}, ${y + 6})`}>
      <rect width={w} height={h} rx={4} fill="#F0F2F5" />
      <text
        x={w / 2}
        y={h / 2 + 3.5}
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
        fontFamily={MONO}
        fill="#0B0C0F"
      >
        {text}
      </text>
    </g>
  );
}

export function ProbabilityCurve({ curve, hours }: ProbabilityCurveProps) {
  const { t } = useI18n();

  // Ticking clock — the NOW marker glides along the curve in real time
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const nowTimestamp = now.getTime();
  // Local time, like codex-reset.com — users plan in their own timezone
  const nowLocalLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const tzLabel = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const allData = curve.map((point) => {
    const pointDate = new Date(point.date);
    pointDate.setUTCHours(point.hour, 0, 0, 0);
    return { ...point, timestamp: pointDate.getTime() };
  });

  // Filter to the selected window. History must be >= the 3h point spacing,
  // otherwise NOW falls off the left edge for ~1h out of every 3h and the
  // marker silently disappears. 4h guarantees a point behind NOW.
  const chartData = hours
    ? allData.filter(
        (p) => p.timestamp >= nowTimestamp - 4 * HOUR && p.timestamp <= nowTimestamp + hours * HOUR
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
      ? `${String(d.getHours()).padStart(2, "0")}:00`
      : `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
          <span className="ml-2 text-muted-foreground/50">{tzLabel}</span>
        </span>
      </div>
      <div className="mt-4">
        <div className="h-40 sm:h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 30, right: 8, left: -20, bottom: 0 }}>
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
                cursor={{ stroke: "#7C8494", strokeWidth: 1, strokeDasharray: "3 3", strokeOpacity: 0.5 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const data = payload[0].payload as ProbabilityPoint & { timestamp: number };
                  const local = new Date(data.timestamp);
                  const dateStr = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
                  return (
                    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-lg">
                      <p className="text-xs text-muted-foreground">
                        {dateStr} {String(local.getHours()).padStart(2, "0")}:00
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
                animationDuration={800}
              />
              {/* NOW — exact current-time position, moves with the ticking clock.
                  Declared after Area so it paints on top of the curve. */}
              {isNowInRange && (
                <>
                  <ReferenceLine
                    x={nowTimestamp}
                    stroke="#F0F2F5"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    strokeOpacity={0.9}
                    label={<NowLabel text={`${t("curve.now")} ${nowLocalLabel}`} />}
                  />
                  {/* Halo ring makes the dot findable at a glance */}
                  <ReferenceDot
                    x={nowTimestamp}
                    y={probAtNow}
                    r={9}
                    fill="none"
                    stroke="#F0F2F5"
                    strokeOpacity={0.35}
                    strokeWidth={1.5}
                  />
                  <ReferenceDot
                    x={nowTimestamp}
                    y={probAtNow}
                    r={4.5}
                    fill="#F0F2F5"
                    stroke="#10A37F"
                    strokeWidth={2.5}
                  />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
