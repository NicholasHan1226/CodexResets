import { describe, expect, it } from 'vitest';
import { buildProbabilityChart, moveChartFocus, PLOT_PADDING } from '../src/lib/probability-curve';
import type { ProbabilityPoint } from '../src/types/reset';

const HOUR = 3_600_000;
const now = Date.UTC(2026, 8, 5, 1);
const point = (end: number, probability = 0.12): ProbabilityPoint => ({
  timestamp: now + end * HOUR, startTimestamp: now + (end - 3) * HOUR,
  probability, date: '2026-09-05', hour: end % 24,
});
const model = (curve: ProbabilityPoint[], hours: 24 | 48 = 24, width = 390) =>
  buildProbabilityChart({ curve, hours, now, width, height: 160 });

describe('probability chart geometry', () => {
  it('keeps an empty or elapsed window finite with only its truthful zero NOW anchor', () => {
    for (const curve of [[], [point(-3)]]) {
      const chart = model(curve);
      expect(chart.chartData).toHaveLength(1);
      expect(chart.chartData[0]).toMatchObject({ timestamp: now, probability: 0 });
      expect(chart.pts[0]).toEqual({ x: PLOT_PADDING.left, y: 160 - PLOT_PADDING.bottom });
      expect(chart.linePath + chart.areaPath).not.toMatch(/NaN|Infinity|undefined/);
      expect(chart.closestPointIndex(999)).toBe(0);
    }
  });

  it('preserves a single future sample and positions both endpoints exactly', () => {
    const chart = model([point(3)]);
    expect(chart.chartData.map((p) => p.probability)).toEqual([0, 0.12]);
    expect(chart.pts[1].x).toBe(390 - PLOT_PADDING.right);
    expect(chart.pts[1].y).toBeLessThan(chart.pts[0].y);
    expect(chart.closestPointIndex(-100)).toBe(0);
    expect(chart.closestPointIndex(999)).toBe(1);
  });

  it.each([24, 48] as const)('clips the %ih boundary without changing input probabilities', (hours) => {
    const curve = Array.from({ length: 17 }, (_, index) => point(index * 3 + 2));
    const original = structuredClone(curve);
    const chart = model(curve, hours);
    expect(chart.chartData.at(-1)?.timestamp).toBe(now + hours * HOUR);
    expect(chart.chartData[1].probability).toBeCloseTo(0.08);
    expect(chart.chartData.at(-1)?.probability).toBeCloseTo(0.04);
    expect(chart.pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(chart.xTicks.every((timestamp) => timestamp >= now && timestamp <= now + hours * HOUR)).toBe(true);
    expect(curve).toEqual(original);
  });

  it('uses the direct official target bucket even when another bucket was the model peak', () => {
    const curve = [point(3, 0.3), point(6, 0.01)];
    const chart = buildProbabilityChart({ curve, now, hours: 24, width: 390, height: 160, planningProbability: 0.8, officialScheduleAt: now + 4 * HOUR });
    expect(chart.hasOfficialTiming).toBe(true);
    expect(chart.peak.timestamp).toBe(now + 6 * HOUR);
    expect(chart.peak.probability).toBeCloseTo(0.5);
    expect(chart.peakStartX).toBe(chart.x(now + 3 * HOUR));
    expect(curve[1].probability).toBe(0.01);
    const outside = buildProbabilityChart({ curve, now, hours: 24, width: 390, height: 160, officialScheduleAt: now + 25 * HOUR });
    expect(outside.hasOfficialTiming).toBe(false);
    expect(outside.peak.timestamp).toBe(now + 3 * HOUR);
  });

  it('reduces 48-hour tick density for mobile without changing samples', () => {
    const curve = Array.from({ length: 16 }, (_, index) => point((index + 1) * 3));
    const mobile = model(curve, 48, 390);
    const desktop = model(curve, 48, 900);
    expect(mobile.xTicks).toHaveLength(2);
    expect(desktop.xTicks).toHaveLength(4);
    expect(mobile.chartData).toEqual(desktop.chartData);
  });

  it('bounds keyboard focus after the horizon shrinks and ignores unrelated keys', () => {
    expect(moveChartFocus('ArrowLeft', 0, 9)).toBe(0);
    expect(moveChartFocus('ArrowRight', 8, 9)).toBe(8);
    expect(moveChartFocus('ArrowLeft', 16, 9)).toBe(7);
    expect(moveChartFocus('ArrowRight', 16, 9)).toBe(8);
    expect(moveChartFocus('Home', 5, 9)).toBe(0);
    expect(moveChartFocus('End', 5, 9)).toBe(8);
    expect(moveChartFocus('ArrowRight', 0, 1)).toBe(0);
    expect(moveChartFocus('Escape', 5, 9)).toBeNull();
  });
});
