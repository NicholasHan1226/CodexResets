/**
 * Reviewed Codex reset history from public announcements by @thsottiaux.
 */

import type { ResetRecord } from '../types/reset';
import { intervalDays, median, mergeResetEpisodes } from './reset-episodes';

/**
 * Reviewed public baseline. Every row includes a direct announcement URL.
 * It initializes the model only while the production database is sparse;
 * production-confirmed records are merged on top.
 */
export const RESET_HISTORY: ResetRecord[] = [
  { id: "1", date: "2026-08-15", timestamp: new Date("2026-08-15T18:00:00Z").getTime(), reason: "Usage included in subscription is fantastic", source: "https://x.com/thsottiaux/status/2088763063495450791", verified: true },
  { id: "2", date: "2026-08-13", timestamp: new Date("2026-08-13T17:01:00Z").getTime(), reason: "Crossed 15M users, enjoy a nice reset", source: "https://x.com/thsottiaux/status/2087706104814023111", verified: true },
  { id: "3", date: "2026-08-12", timestamp: new Date("2026-08-12T16:00:00Z").getTime(), reason: "Little surprise tomorrow - 15M users milestone", source: "https://x.com/thsottiaux/status/2087423996115681767", verified: true },
  { id: "4", date: "2026-08-11", timestamp: new Date("2026-08-11T17:00:00Z").getTime(), reason: "Usage limits reset for all paid users", source: "https://x.com/thsottiaux/status/2086972933566857393", verified: true },
  { id: "5", date: "2026-08-11", timestamp: new Date("2026-08-11T09:01:00Z").getTime(), reason: "Reset completed as promised", source: "https://x.com/thsottiaux/status/2086972802457063486", verified: true },
  { id: "6", date: "2026-08-08", timestamp: new Date("2026-08-08T18:00:00Z").getTime(), reason: "Performative reset on Monday", source: "https://x.com/thsottiaux/status/2086189414292865249", verified: true },
  { id: "7", date: "2026-08-08", timestamp: new Date("2026-08-08T17:00:00Z").getTime(), reason: "GPT-5.6 Sol celebration reset", source: "https://x.com/thsottiaux/status/2086188036493344823", verified: true },
  { id: "8", date: "2026-08-01", timestamp: new Date("2026-08-01T18:00:00Z").getTime(), reason: "Week of efficiency celebration", source: "https://x.com/thsottiaux/status/2083395449814229287", verified: true },
];

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
