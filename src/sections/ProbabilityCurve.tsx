import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { ProbabilityPoint } from "@/types/reset";
import { useI18n } from "@/contexts/I18nContext";

interface ProbabilityCurveProps {
  curve: ProbabilityPoint[];
  /** When set, only show points within the next N hours from now */
  hours?: number;
  /** Direct official timing replaces the history-only curve as the public answer. */
  officialSchedule?: {
    targetLabel: string | null;
    window: 'within' | 'after' | 'pending' | 'elapsed';
  };
}

const HOUR = 3600 * 1000;
const MONO = "IBM Plex Mono, monospace";

// Palette — mirrors DESIGN.md tokens
const C = {
  green: "#10A37F",
  text: "#F0F2F5",
  dim: "#7C8494",
  grid: "#26272E",
  bg: "#0B0C0F",
};

// Plot padding — NOW pill lives in the top band, tick labels in the bottom band
const PAD = { top: 30, right: 10, bottom: 24, left: 38 };

interface Pt {
  x: number;
  y: number;
}

/** Track the pixel size of the chart container so coordinates are exact */
function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Catmull-Rom → cubic bezier smoothing (same look as recharts' monotone) */
function smoothLine(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function ProbabilityCurve({ curve, hours, officialSchedule }: ProbabilityCurveProps) {
  const { t } = useI18n();
  const [containerRef, { width, height }] = useElementSize<HTMLDivElement>();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Ticking clock — the NOW marker glides along the curve in real time
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  if (officialSchedule) {
    const relation = officialSchedule.window === 'within'
      ? 'curve.scheduleWithin'
      : officialSchedule.window === 'after'
        ? 'curve.scheduleAfter'
        : officialSchedule.window === 'elapsed'
          ? 'curve.scheduleElapsed'
          : 'curve.schedulePending';
    return (
      <section aria-label="Official reset timing" className="max-w-4xl">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            <span className="mr-2 font-mono font-normal text-primary">❯</span>
            {t('curve.scheduleTitle')}
          </h2>
          <span className="font-mono text-xs text-muted-foreground">
            {t(relation, { n: hours ?? 24 })}
          </span>
        </div>
        <p className="mt-4 border-y border-primary/20 py-5 font-mono text-xl font-semibold text-primary sm:text-2xl">
          {officialSchedule.targetLabel
            ? t('curve.scheduleTarget', { time: officialSchedule.targetLabel })
            : t('curve.schedulePending')}
        </p>
      </section>
    );
  }
  const nowTimestamp = now.getTime();
  // Local time, like codex-reset.com — users plan in their own timezone
  const nowLocalLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const tzLabel = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const allData = curve.map((point) => {
    return { ...point, timestamp: point.timestamp };
  });

  // Forecast samples begin three hours in the future. Add the exact current
  // moment as a zero-length forecast so the user always has a truthful visual
  // position: the NOW marker is the left edge of the forward-looking window.
  const nowAnchor = {
    date: now.toISOString().slice(0, 10),
    hour: now.getUTCHours(),
    probability: 0,
    timestamp: nowTimestamp,
  };
  const chartPoints = [nowAnchor, ...allData];

  // Filter to the selected forward-looking window while retaining the exact
  // now anchor. This avoids losing the current-time marker between 3h samples.
  const chartData = hours
    ? chartPoints.filter(
        (p) => p.timestamp >= nowTimestamp - 4 * HOUR && p.timestamp <= nowTimestamp + hours * HOUR
      )
    : chartPoints;

  if (chartData.length === 0) return null;

  const peak = chartData.reduce(
    (max, point) => (point.probability > max.probability ? point : max),
    chartData[0]
  );

  const minTs = chartData[0].timestamp;
  const maxTs = chartData[chartData.length - 1].timestamp;
  const range = maxTs - minTs;
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

  // --- Scales -------------------------------------------------------------
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = Math.max(1, height - PAD.top - PAD.bottom);
  const x = (ts: number) => PAD.left + ((ts - minTs) / range) * plotW;

  // Nice ceiling: round the data max up to a clean 5% step with headroom
  const rawMax = Math.max(peak.probability, probAtNow, 0.05);
  const yMax = Math.max(0.1, Math.ceil(((rawMax * 1.15) / 0.05)) * 0.05);
  const y = (p: number) => PAD.top + (1 - p / yMax) * plotH;

  const pts: Pt[] = chartData.map((p) => ({ x: x(p.timestamp), y: y(p.probability) }));
  const linePath = smoothLine(pts);
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${PAD.top + plotH} L ${pts[0].x} ${PAD.top + plotH} Z`;

  // --- Ticks ---------------------------------------------------------------
  const step = range <= 26 * HOUR ? 6 * HOUR : range <= 50 * HOUR ? 12 * HOUR : 24 * HOUR;
  const xTicks: number[] = [];
  for (let ts = Math.ceil(minTs / step) * step; ts <= maxTs; ts += step) xTicks.push(ts);

  const yStep = yMax > 0.2 ? 0.1 : 0.05;
  const yTicks: number[] = [];
  for (let v = 0; v <= yMax + 1e-9; v += yStep) yTicks.push(Number(v.toFixed(2)));

  const formatXTick = (ts: number) => {
    const d = new Date(ts);
    return hours
      ? `${String(d.getHours()).padStart(2, "0")}:00`
      : `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // --- NOW geometry ----------------------------------------------------------
  const nowX = x(nowTimestamp);
  const nowY = y(probAtNow);
  const pillText = `${t("curve.now")} ${nowLocalLabel}`;
  const pillW = 88;
  const pillH = 18;
  const pillX = clamp(nowX, pillW / 2, Math.max(pillW / 2, width - pillW / 2));

  // --- Hover -----------------------------------------------------------------
  const closestPointIndex = (clientX: number, element: SVGSVGElement) => {
    const rect = element.getBoundingClientRect();
    const ts = minTs + ((clientX - rect.left - PAD.left) / plotW) * range;
    let best = 0;
    let bestDist = Infinity;
    chartData.forEach((p, i) => {
      const d = Math.abs(p.timestamp - ts);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  const nearestNowIndex = chartData.reduce(
    (best, point, index) => Math.abs(point.timestamp - nowTimestamp) < Math.abs(chartData[best].timestamp - nowTimestamp) ? index : best,
    0
  );
  const firstForecastIndex = chartData.length > 1 ? 1 : nearestNowIndex;

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right) return;
    setHoverIdx(closestPointIndex(e.clientX, e.currentTarget));
  };

  const handleKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    const current = hoverIdx ?? nearestNowIndex;
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = Math.max(0, current - 1);
    if (e.key === 'ArrowRight') next = Math.min(chartData.length - 1, current + 1);
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = chartData.length - 1;
    if (next === null) return;
    e.preventDefault();
    setHoverIdx(next);
  };

  const hoverPoint = hoverIdx !== null ? chartData[hoverIdx] : null;
  const hoverLocal = hoverPoint ? new Date(hoverPoint.timestamp) : null;

  return (
    <section aria-label="Probability curve" className="max-w-4xl">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold text-foreground">
          <span className="mr-2 font-mono font-normal text-primary">❯</span>
          {t("curve.title")}
          {hours && (
            <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
              {t("curve.window", { n: hours })}
            </span>
          )}
        </h2>
        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          {t("curve.peakWindow")}: {Math.round(peak.probability * 100)}%
          <span className="text-muted-foreground/50"> · {tzLabel}</span>
        </span>
      </div>
      <div className="mt-4">
        <div ref={containerRef} className="relative h-40 w-full sm:h-56">
          {width > 0 && height > 0 && (
            <svg
              width={width}
              height={height}
              className="block cursor-crosshair touch-pan-y"
              onPointerMove={handlePointerMove}
              onPointerDown={handlePointerMove}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') setHoverIdx(null);
              }}
              onFocus={() => setHoverIdx((current) => current ?? firstForecastIndex)}
              onBlur={() => setHoverIdx(null)}
              onKeyDown={handleKeyDown}
              tabIndex={0}
              role="group"
              aria-label={hours ? t("curve.window", { n: hours }) : t("curve.subtitle")}
              aria-describedby="curve-explorer-status"
            >
              <defs>
                <linearGradient id="probGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.green} stopOpacity={0.28} />
                  <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                </linearGradient>
              </defs>

              {/* Horizontal gridlines + y labels */}
              {yTicks.map((v) => (
                <g key={v}>
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={y(v)}
                    y2={y(v)}
                    stroke={C.grid}
                    strokeWidth={1}
                    strokeOpacity={v === 0 ? 1 : 0.55}
                  />
                  <text
                    x={PAD.left - 8}
                    y={y(v) + 3.5}
                    textAnchor="end"
                    fontSize={10}
                    fontFamily={MONO}
                    fill={C.dim}
                  >
                    {Math.round(v * 100)}%
                  </text>
                </g>
              ))}

              {/* X tick labels (local time) */}
              {xTicks.map((ts) => (
                <text
                  key={ts}
                  x={clamp(x(ts), PAD.left + 14, width - PAD.right - 14)}
                  y={height - 7}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily={MONO}
                  fill={C.dim}
                >
                  {formatXTick(ts)}
                </text>
              ))}

              {/* Peak dashed line */}
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(peak.probability)}
                y2={y(peak.probability)}
                stroke={C.green}
                strokeWidth={1}
                strokeDasharray="3 3"
                strokeOpacity={0.4}
              />

              {/* Area + line */}
              <path d={areaPath} fill="url(#probGradient)" />
              <path
                d={linePath}
                fill="none"
                stroke={C.green}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Hover crosshair */}
              {hoverIdx !== null && pts[hoverIdx] && (
                <g>
                  <line
                    x1={pts[hoverIdx].x}
                    x2={pts[hoverIdx].x}
                    y1={PAD.top}
                    y2={PAD.top + plotH}
                    stroke={C.dim}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                  />
                  <circle
                    cx={pts[hoverIdx].x}
                    cy={pts[hoverIdx].y}
                    r={3.5}
                    fill={C.green}
                    stroke={C.bg}
                    strokeWidth={1.5}
                  />
                </g>
              )}

              {/* NOW — painted last so nothing covers it. Plain SVG elements with
                  coordinates computed above: no library can swallow this marker. */}
              {isNowInRange && (
                <g>
                  <line
                    x1={nowX}
                    x2={nowX}
                    y1={PAD.top}
                    y2={PAD.top + plotH}
                    stroke={C.text}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    strokeOpacity={0.9}
                  />
                  {/* Halo ring makes the dot findable at a glance */}
                  <circle
                    cx={nowX}
                    cy={nowY}
                    r={9}
                    fill="none"
                    stroke={C.text}
                    strokeOpacity={0.35}
                    strokeWidth={1.5}
                  />
                  <circle cx={nowX} cy={nowY} r={4.5} fill={C.text} stroke={C.green} strokeWidth={2.5} />
                  {/* Pill label pinned above the plot, clamped to the chart edges */}
                  <g transform={`translate(${pillX - pillW / 2}, 4)`}>
                    <rect width={pillW} height={pillH} rx={4} fill={C.text} />
                    <text
                      x={pillW / 2}
                      y={pillH / 2 + 3.5}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={700}
                      fontFamily={MONO}
                      fill={C.bg}
                    >
                      {pillText}
                    </text>
                  </g>
                </g>
              )}
            </svg>
          )}

          {/* HTML tooltip — follows the hovered point */}
          {hoverPoint && hoverLocal && hoverIdx !== null && hoverIdx > 0 && pts[hoverIdx] && (
            <div
              className="pointer-events-none absolute z-10 rounded-md border border-border bg-card px-3 py-2 shadow-lg"
              style={{
                left: clamp(pts[hoverIdx ?? 0].x, 64, width - 64),
                top: Math.max(0, pts[hoverIdx ?? 0].y - 14),
                transform: "translate(-50%, -100%)",
              }}
            >
              <p className="text-xs text-muted-foreground">
                {hoverLocal.getFullYear()}-{String(hoverLocal.getMonth() + 1).padStart(2, "0")}-
                {String(hoverLocal.getDate()).padStart(2, "0")}{" "}
                {String(hoverLocal.getHours()).padStart(2, "0")}:00
              </p>
              <p className="font-mono text-sm font-semibold text-primary">
                {Math.round(hoverPoint.probability * 100)}%
              </p>
            </div>
          )}
          <p id="curve-explorer-status" className="sr-only" aria-live="polite">
            {hoverPoint && hoverLocal && hoverIdx !== null && hoverIdx > 0
              ? `${hoverLocal.getFullYear()}-${String(hoverLocal.getMonth() + 1).padStart(2, "0")}-${String(hoverLocal.getDate()).padStart(2, "0")} ${String(hoverLocal.getHours()).padStart(2, "0")}:00, ${Math.round(hoverPoint.probability * 100)}%`
              : hoverIdx === 0 ? `${t("curve.now")} · ${t("curve.fromNow")}` : ''}
          </p>
        </div>

        {/* Inline readout — answers "where am I on this curve" even at a glance */}
        {isNowInRange && (
          <p className="mt-2 font-mono text-xs text-muted-foreground/70">
            <span className="inline-block h-2 w-2 rounded-full bg-foreground ring-1 ring-primary align-middle" />
            <span className="ml-2">
              {t("curve.now")} {nowLocalLabel}
            </span>
            <span className="mx-2 text-border">·</span>
            <span>{t("curve.fromNow")}</span>
            <span className="mx-2 text-border">·</span>
            {tzLabel}
          </p>
        )}
      </div>
    </section>
  );
}
