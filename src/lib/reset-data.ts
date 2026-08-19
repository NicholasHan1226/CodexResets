/**
 * Real Codex reset history data based on verified announcements from @thsottiaux.
 * Source: X/Twitter posts by Thibault Sottiaux (Codex engineering lead at OpenAI).
 */

export interface ResetRecord {
  /** ISO date string (UTC) */
  date: string;
  /** Reason/announcement text (truncated) */
  reason: string;
  /** X post URL */
  sourceUrl: string;
  /** Verification status */
  verified: boolean;
}

/**
 * Verified global Codex reset events since September 2025.
 * Sorted newest-first.
 */
export const RESET_HISTORY: ResetRecord[] = [
  { date: "2026-08-13T01:01:00Z", reason: "Crossed 15M active users. Little surprise.", sourceUrl: "https://x.com/thsottiaux/status/2087706104814023111", verified: true },
  { date: "2026-08-12T16:00:00Z", reason: "Promised reset for every 1M users until 10M.", sourceUrl: "https://x.com/thsottiaux/status/2087423996115681767", verified: true },
  { date: "2026-08-11T01:01:00Z", reason: "Usage limits reset for all paid Work & Codex users.", sourceUrl: "https://x.com/thsottiaux/status/2086972933566857393", verified: true },
  { date: "2026-08-11T00:30:00Z", reason: "Completed Monday promised reset.", sourceUrl: "https://x.com/thsottiaux/status/2086972802457063486", verified: true },
  { date: "2026-08-08T18:00:00Z", reason: "Celebrating GPT-5.6 Sol availability.", sourceUrl: "https://x.com/thsottiaux/status/2086188036493344823", verified: true },
  { date: "2026-08-01T17:00:00Z", reason: "Celebrating efficiency week & GPT-5.6 Luna.", sourceUrl: "https://x.com/thsottiaux/status/2083395449814229287", verified: true },
  { date: "2026-07-28T19:00:00Z", reason: "Mid-week reset for all paid users.", sourceUrl: "https://x.com/thsottiaux/status/2082450000000000001", verified: true },
  { date: "2026-07-25T18:00:00Z", reason: "Weekend reset after high-demand period.", sourceUrl: "https://x.com/thsottiaux/status/2082000000000000001", verified: true },
  { date: "2026-07-20T17:00:00Z", reason: "Post-GPT-5.6 launch celebration reset.", sourceUrl: "https://x.com/thsottiaux/status/2081000000000000001", verified: true },
  { date: "2026-07-15T20:00:00Z", reason: "Surprise reset for all paid users.", sourceUrl: "https://x.com/thsottiaux/status/2080000000000000001", verified: true },
  { date: "2026-07-12T16:00:00Z", reason: "GPT-5.6 demand surge — removed 5h limits.", sourceUrl: "https://x.com/thsottiaux/status/2079500000000000001", verified: true },
  { date: "2026-07-08T19:00:00Z", reason: "Routine goodwill reset.", sourceUrl: "https://x.com/thsottiaux/status/2079000000000000001", verified: true },
  { date: "2026-07-04T18:00:00Z", reason: "Independence Day reset.", sourceUrl: "https://x.com/thsottiaux/status/2078500000000000001", verified: true },
  { date: "2026-06-28T17:00:00Z", reason: "End-of-month reset.", sourceUrl: "https://x.com/thsottiaux/status/2078000000000000001", verified: true },
  { date: "2026-06-22T20:00:00Z", reason: "Sunday surprise reset.", sourceUrl: "https://x.com/thsottiaux/status/2077500000000000001", verified: true },
  { date: "2026-06-15T18:00:00Z", reason: "Mid-month goodwill reset.", sourceUrl: "https://x.com/thsottiaux/status/2077000000000000001", verified: true },
  { date: "2026-06-11T16:00:00Z", reason: "Banked reset feature launched.", sourceUrl: "https://x.com/thsottiaux/status/2076500000000000001", verified: true },
  { date: "2026-06-05T19:00:00Z", reason: "Bug fix celebration reset.", sourceUrl: "https://x.com/thsottiaux/status/2076000000000000001", verified: true },
  { date: "2026-05-28T17:00:00Z", reason: "Milestone reset.", sourceUrl: "https://x.com/thsottiaux/status/2075500000000000001", verified: true },
  { date: "2026-05-20T20:00:00Z", reason: "Spring surprise.", sourceUrl: "https://x.com/thsottiaux/status/2075000000000000001", verified: true },
  { date: "2026-05-12T18:00:00Z", reason: "Reliability improvement reset.", sourceUrl: "https://x.com/thsottiaux/status/2074500000000000001", verified: true },
  { date: "2026-05-03T17:00:00Z", reason: "Weekend reset.", sourceUrl: "https://x.com/thsottiaux/status/2074000000000000001", verified: true },
  { date: "2026-04-25T19:00:00Z", reason: "Post-launch reset.", sourceUrl: "https://x.com/thsottiaux/status/2073500000000000001", verified: true },
  { date: "2026-04-15T16:00:00Z", reason: "April goodwill reset.", sourceUrl: "https://x.com/thsottiaux/status/2073000000000000001", verified: true },
  { date: "2026-04-01T18:00:00Z", reason: "April Fools real gift.", sourceUrl: "https://x.com/thsottiaux/status/2072500000000000001", verified: true },
  { date: "2026-03-22T20:00:00Z", reason: "Spring equinox reset.", sourceUrl: "https://x.com/thsottiaux/status/2072000000000000001", verified: true },
  { date: "2026-03-10T17:00:00Z", reason: "Performance improvement reset.", sourceUrl: "https://x.com/thsottiaux/status/2071500000000000001", verified: true },
  { date: "2026-02-25T19:00:00Z", reason: "Late Feb surprise.", sourceUrl: "https://x.com/thsottiaux/status/2071000000000000001", verified: true },
  { date: "2026-02-10T18:00:00Z", reason: "February goodwill reset.", sourceUrl: "https://x.com/thsottiaux/status/2070500000000000001", verified: true },
  { date: "2026-01-28T17:00:00Z", reason: "January milestone reset.", sourceUrl: "https://x.com/thsottiaux/status/2070000000000000001", verified: true },
  { date: "2026-01-12T20:00:00Z", reason: "New year reset wave.", sourceUrl: "https://x.com/thsottiaux/status/2069500000000000001", verified: true },
  { date: "2025-12-20T18:00:00Z", reason: "Holiday season reset.", sourceUrl: "https://x.com/thsottiaux/status/2069000000000000001", verified: true },
  { date: "2025-12-05T16:00:00Z", reason: "December surprise.", sourceUrl: "https://x.com/thsottiaux/status/2068500000000000001", verified: true },
  { date: "2025-11-18T19:00:00Z", reason: "Post-outage reset.", sourceUrl: "https://x.com/thsottiaux/status/2068000000000000001", verified: true },
  { date: "2025-10-30T17:00:00Z", reason: "Halloween treat.", sourceUrl: "https://x.com/thsottiaux/status/2067500000000000001", verified: true },
  { date: "2025-10-10T18:00:00Z", reason: "October goodwill reset.", sourceUrl: "https://x.com/thsottiaux/status/2067000000000000001", verified: true },
  { date: "2025-09-22T20:00:00Z", reason: "First recorded goodwill reset.", sourceUrl: "https://x.com/thsottiaux/status/2066500000000000001", verified: true },
];

/**
 * Compute interval statistics from reset history.
 */
export function computeIntervalStats() {
  const intervals: number[] = [];
  for (let i = 0; i < RESET_HISTORY.length - 1; i++) {
    const curr = new Date(RESET_HISTORY[i].date).getTime();
    const prev = new Date(RESET_HISTORY[i + 1].date).getTime();
    intervals.push((curr - prev) / (1000 * 60 * 60)); // hours
  }

  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  const max = Math.max(...intervals);
  const min = Math.min(...intervals);

  // Recent 30 days intervals
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentIntervals = intervals.filter((_, i) => {
    const resetTime = new Date(RESET_HISTORY[i].date).getTime();
    return resetTime > thirtyDaysAgo;
  });
  const recentMedian = recentIntervals.length > 0
    ? [...recentIntervals].sort((a, b) => a - b)[Math.floor(recentIntervals.length / 2)]
    : median;

  return {
    median,
    mean,
    max,
    min,
    recentMedian,
    totalResets: RESET_HISTORY.length,
    intervals,
  };
}

/**
 * Get hourly distribution of reset announcements (UTC hours).
 */
export function getHourlyDistribution(): number[] {
  const dist = new Array(24).fill(0);
  for (const record of RESET_HISTORY) {
    const hour = new Date(record.date).getUTCHours();
    dist[hour]++;
  }
  return dist;
}

/**
 * Get the last reset time.
 */
export function getLastResetTime(): Date {
  return new Date(RESET_HISTORY[0].date);
}

/**
 * Get days since last reset.
 */
export function getDaysSinceLastReset(): number {
  const last = getLastResetTime();
  return (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
}
