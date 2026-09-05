import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { getEffectiveHistory, MIN_CALENDAR_RECORDS } from "@/lib/reset-data";
import type { ProbabilityPoint } from "@/types/reset";
import { useI18n } from "@/contexts/I18nContext";
import { formatTimingRange, timingBucketStart } from "@/lib/forecast-display";

import { buildProbabilityChart, clamp, moveChartFocus, PLOT_PADDING as PAD } from "@/lib/probability-curve";

interface ProbabilityCurveProps {
  /** Shared dashboard clock; standalone renders use the current instant. */
  currentTime?: number;
  curve: ProbabilityPoint[];
  /** When set, only show points within the next N hours from now */
  hours?: 24 | 48;
  /** Combined visitor-facing probability for the selected horizon. */
  planningProbability?: number;
  /** A direct official target inside the selected horizon, if one exists. */
  officialScheduleAt?: number | null;
}

const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

// Palette — mirrors DESIGN.md tokens
const C = {
  green: "#10A37F",
  text: "#F0F2F5",
  dim: "#7C8494",
  grid: "#26272E",
  bg: "#0B0C0F",
};

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

export function ProbabilityCurve({ curve, hours, planningProbability, officialScheduleAt, currentTime }: ProbabilityCurveProps) {
  const { t, locale } = useI18n();
  const [containerRef, { width, height }] = useElementSize<HTMLDivElement>();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const [initialTime] = useState(Date.now);
  const nowTimestamp = currentTime ?? initialTime;
  const now = new Date(nowTimestamp);
  const nowLocalLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const tzLabel = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const {
    chartData, peak, hasOfficialTiming, x, y, pts, linePath, areaPath,
    peakStartX, peakEndX, plotH, xTicks, yTicks, closestPointIndex,
  } = buildProbabilityChart({ curve, hours, planningProbability, officialScheduleAt, now: nowTimestamp, width, height });
  const peakTime = formatTimingRange(timingBucketStart(peak), peak.timestamp);
  // Reuse the existing sparse-history presentation floor; this is not an accuracy claim.
  const sparseHistory = getEffectiveHistory().length < MIN_CALENDAR_RECORDS;
  const showPeak = hasOfficialTiming || (getEffectiveHistory().length > 0 && peak.timestamp > nowTimestamp && peak.probability > 0);
  const officialTime = hasOfficialTiming && typeof officialScheduleAt === 'number'
    ? new Date(officialScheduleAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-GB', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : null;

  const formatXTick = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  // --- NOW geometry ----------------------------------------------------------
  const { x: nowX, y: nowY } = pts[0];
  const pillText = `${t("curve.now")} ${nowLocalLabel}`;
  const pillW = 88;
  const pillH = 18;
  const pillX = clamp(nowX, pillW / 2, Math.max(pillW / 2, width - pillW / 2));

  // --- Hover -----------------------------------------------------------------
  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right) return;
    setHoverIdx(closestPointIndex(e.clientX - rect.left));
  };

  const handleKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    const next = moveChartFocus(e.key, hoverIdx ?? 0, chartData.length);
    if (next === null) return;
    e.preventDefault();
    setHoverIdx(next);
  };

  const hoverPoint = hoverIdx !== null ? chartData[hoverIdx] : null;
  const hoveredIsPeak = showPeak && hoverPoint?.timestamp === peak.timestamp;

  return (
    <section aria-label="Probability curve" className="max-w-4xl">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-foreground">
          {t("curve.title")}
          {hours && (
            <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
              {t("curve.window", { n: hours })}
            </span>
          )}
        </h2>
        <span className="text-xs leading-relaxed text-primary/90">
          {officialTime
            ? t("curve.scheduleTarget", { time: officialTime })
            : showPeak ? t("curve.likeliestTime", { time: peakTime }) : t("curve.sparseTiming")
          }

        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{sparseHistory && !officialTime ? t("curve.sparseTiming") : t("curve.distributionHint")}</p>
      <div className="mt-4">
        <div ref={containerRef} className="relative h-40 w-full sm:h-56">
          {width > 0 && height > 0 && (
            <svg
              width={width}
              height={height}
              className="block max-w-full cursor-crosshair touch-pan-y"
              onPointerMove={handlePointerMove}
              onPointerDown={handlePointerMove}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') setHoverIdx(null);
              }}
              onFocus={() => setHoverIdx((current) => current ?? Math.min(1, chartData.length - 1))}
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

              {/* The hero owns the overall 24h/48h probability. This chart is
                  intentionally a timing distribution, not a second percentage readout. */}
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
                </g>
              ))}

              {/* X tick labels (local time) */}
              {xTicks.map((ts) => (
                <text
                  key={ts}
                  x={clamp(x(ts), PAD.left + 14, width - PAD.right - 14)}
                  y={height - 20}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily={MONO}
                  fill={C.dim}
                >
                  <tspan x={clamp(x(ts), PAD.left + 14, width - PAD.right - 14)}>{formatXTick(ts)}</tspan>
                  <tspan x={clamp(x(ts), PAD.left + 14, width - PAD.right - 14)} dy={13} opacity={0.7}>
                    {new Date(ts).getMonth() + 1}/{new Date(ts).getDate()}
                  </tspan>
                </text>
              ))}

              {/* The highlighted band answers the only chart question: when is likeliest? */}
              {showPeak && <rect
                x={peakStartX}
                y={PAD.top}
                width={Math.max(1, peakEndX - peakStartX)}
                height={plotH}
                fill={C.green}
                fillOpacity={0.1}
              />}

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
              {showPeak && <circle cx={x(peak.timestamp)} cy={y(peak.probability)} r={4} fill={C.green} stroke={C.bg} strokeWidth={2} />}

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
            </svg>
          )}

          {/* HTML tooltip — follows the hovered point */}
          {hoverPoint && hoverIdx !== null && hoverIdx > 0 && pts[hoverIdx] && (
            <div
              className="pointer-events-none absolute z-10 rounded-md border border-border bg-card px-3 py-2 shadow-lg"
              style={{
                width: Math.min(216, width - 16),
                left: clamp(pts[hoverIdx].x, Math.min(108, width / 2), Math.max(width / 2, width - 108)),
                top: Math.max(0, pts[hoverIdx].y - 14),
                transform: "translate(-50%, -100%)",
              }}
            >
              <p className="text-xs text-muted-foreground">
                {formatTimingRange(timingBucketStart(hoverPoint), hoverPoint.timestamp)}
              </p>
              {hoveredIsPeak && <p className="font-mono text-sm font-semibold text-primary">{t("curve.highestLikelihood")}</p>}
            </div>
          )}
          <p id="curve-explorer-status" className="sr-only" aria-live="polite">
            {hoverPoint && hoverIdx !== null && hoverIdx > 0
              ? `${formatTimingRange(timingBucketStart(hoverPoint), hoverPoint.timestamp)}${hoveredIsPeak ? `, ${t("curve.highestLikelihood")}` : ''}`
              : hoverIdx === 0 ? `${t("curve.now")} · ${t("curve.fromNow")}` : ''}
          </p>
        </div>

        <p className="mt-2 text-right font-mono text-[10px] text-muted-foreground/70">{tzLabel}</p>
      </div>
    </section>
  );
}
