import type { ProbabilityPoint } from '@/types/reset';
import { alignTimingCurveWithOfficialSchedule, getTimingWindow, timingBucketStart } from '@/lib/forecast-display';

const HOUR = 3_600_000;
export const PLOT_PADDING = { top: 30, right: 10, bottom: 36, left: 38 };
export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
interface Point { x: number; y: number }

/** Catmull-Rom controls are clamped vertically to avoid overshooting probability samples. */
function smoothLine(points: Point[]): string {
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6, Math.min(p1.y, p2.y), Math.max(p1.y, p2.y));
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6, Math.min(p1.y, p2.y), Math.max(p1.y, p2.y));
    path += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return path;
}

interface ChartInput {
  curve: ProbabilityPoint[];
  hours?: 24 | 48;
  planningProbability?: number;
  officialScheduleAt?: number | null;
  now: number;
  width: number;
  height: number;
}

/** Display-only geometry; the history model and its probability inputs remain unchanged. */
export function buildProbabilityChart({ curve, hours, planningProbability, officialScheduleAt, now, width, height }: ChartInput) {
  const windowData = getTimingWindow(curve, hours ?? 168, now);
  const officialBucketIndex = typeof officialScheduleAt === 'number' && Number.isFinite(officialScheduleAt)
    && hours !== undefined && officialScheduleAt > now && officialScheduleAt <= now + hours * HOUR
    ? windowData.findIndex((point) => officialScheduleAt > timingBucketStart(point) && officialScheduleAt <= point.timestamp)
    : -1;
  const forecastData = alignTimingCurveWithOfficialSchedule(windowData, planningProbability, officialScheduleAt, hours, now);
  const date = new Date(now);
  // NOW is always the leftmost zero-length forecast, including an empty window.
  const nowAnchor: ProbabilityPoint = { date: date.toISOString().slice(0, 10), hour: date.getUTCHours(), probability: 0, timestamp: now };
  const chartData = [nowAnchor, ...forecastData];
  const peak = officialBucketIndex >= 0 ? forecastData[officialBucketIndex] : forecastData.reduce(
    (max, point) => point.probability > max.probability ? point : max, forecastData[0] ?? nowAnchor,
  );
  const maxTs = chartData[chartData.length - 1].timestamp;
  const range = Math.max(1, maxTs - now);
  const { left, right, top, bottom } = PLOT_PADDING;
  const plotW = Math.max(1, width - left - right);
  const plotH = Math.max(1, height - top - bottom);
  const x = (timestamp: number) => left + ((timestamp - now) / range) * plotW;
  const rawMax = Math.max(...chartData.map((point) => point.probability), 0.05);
  const yMax = Math.max(0.1, Math.ceil(rawMax * 1.15 / 0.05) * 0.05);
  const y = (probability: number) => top + (1 - probability / yMax) * plotH;
  const pts = chartData.map((point) => ({ x: x(point.timestamp), y: y(point.probability) }));
  const linePath = smoothLine(pts);
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${top + plotH} L ${pts[0].x} ${top + plotH} Z`;
  const step = range <= 26 * HOUR ? 6 * HOUR : range <= 50 * HOUR ? (width < 500 ? 24 : 12) * HOUR : 24 * HOUR;
  const xTicks: number[] = [];
  for (let ts = Math.ceil(now / step) * step; ts <= maxTs; ts += step) xTicks.push(ts);
  const yStep = yMax > 0.2 ? 0.1 : 0.05;
  const yTicks: number[] = [];
  for (let value = 0; value <= yMax + 1e-9; value += yStep) yTicks.push(Number(value.toFixed(2)));

  const closestPointIndex = (localX: number) => {
    const timestamp = now + ((localX - left) / plotW) * range;
    let best = 0;
    chartData.forEach((point, index) => {
      if (Math.abs(point.timestamp - timestamp) < Math.abs(chartData[best].timestamp - timestamp)) best = index;
    });
    return best;
  };
  return {
    chartData, peak, hasOfficialTiming: officialBucketIndex >= 0, x, y, pts, linePath, areaPath,
    peakStartX: x(Math.max(now, timingBucketStart(peak))), peakEndX: x(peak.timestamp),
    plotH, xTicks, yTicks, closestPointIndex,
  };
}

/** Keyboard exploration stays within the current horizon after a 24/48-hour switch. */
export function moveChartFocus(key: string, current: number, count: number): number | null {
  const last = Math.max(0, count - 1);
  const index = clamp(current, 0, last);
  switch (key) {
    case 'ArrowLeft': return Math.max(0, index - 1);
    case 'ArrowRight': return Math.min(last, index + 1);
    case 'Home': return 0;
    case 'End': return last;
    default: return null;
  }
}
