/**
 * Canonical reset history from verified production observations.
 */

import type { ResetRecord } from '../types/reset';
import { intervalDays, median, mergeResetEpisodes } from './reset-episodes';

/**
 * The old bundled seed mixed future plans with completion records and used
 * unsupported event times. Keep it out of all model and display inputs.
 * Source URLs remain in docs/history-baseline-audit.md for later verification.
 */
export const RESET_HISTORY: ResetRecord[] = [];
export const FORECAST_INPUT_VERSION = 'verified-production-v1';

// Allow extending the reviewed baseline with fresher Worker-confirmed records.
// Panels and forecasting use the canonical episode series so multiple posts
// about one reset do not create artificial short intervals.
let dynamicResetHistory: ResetRecord[] | null = null;
export const MIN_CALENDAR_RECORDS = 12;

export function setDynamicResetHistory(records: ResetRecord[] | null): void {
  dynamicResetHistory = records && records.length > 0 ? records : null;
}

export function getEffectiveHistory(): ResetRecord[] {
  const verifiedDynamicHistory = (dynamicResetHistory || []).filter((record) => record.verified === true);
  return mergeResetEpisodes([...verifiedDynamicHistory, ...RESET_HISTORY]);
}

/** A year heatmap is useful only after enough reviewed episodes exist. */
export function shouldShowResetCalendar(history = getEffectiveHistory()): boolean {
  return history.length >= MIN_CALENDAR_RECORDS;
}

/**
 * Compute interval statistics from reset history.
 */
export function computeIntervalStats() {
  const history = getEffectiveHistory();
  const intervals = intervalDays(history).map((days) => days * 24);

  const sorted = [...intervals].sort((a, b) => a - b);
  const medianHours = median(sorted, 3.8 * 24);
  const mean = intervals.length > 0 ? intervals.reduce((s, v) => s + v, 0) / intervals.length : medianHours;
  const max = intervals.length > 0 ? Math.max(...intervals) : medianHours;
  const min = intervals.length > 0 ? Math.min(...intervals) : medianHours;

  // Recent 30 days intervals
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentIntervals = intervals.filter((_, i) => {
    const resetTime = history[i].timestamp;
    return resetTime > thirtyDaysAgo;
  });
  const recentMedian = recentIntervals.length > 0
    ? [...recentIntervals].sort((a, b) => a - b)[Math.floor(recentIntervals.length / 2)]
    : medianHours;

  return {
    medianHours,
    medianDays: medianHours / 24,
    meanHours: mean,
    meanDays: mean / 24,
    maxHours: max,
    maxDays: max / 24,
    minHours: min,
    minDays: min / 24,
    recentMedianHours: recentMedian,
    recentMedianDays: recentMedian / 24,
    totalResets: history.length,
  };
}

/**
 * Compute hourly distribution of reset announcements.
 * Returns array of 24 elements (one per hour UTC) with count of resets in that hour.
 */
export function computeHourlyDistribution(): number[] {
  const distribution = new Array(24).fill(0);
  for (const record of getEffectiveHistory()) {
    const hour = new Date(record.timestamp).getUTCHours();
    distribution[hour]++;
  }
  return distribution;
}
