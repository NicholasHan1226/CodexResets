import type { ResetRecord } from '@/types/reset';

const EPISODE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A reset can be announced, clarified, and confirmed in several posts. Those
 * posts are evidence for one product event, not independent reset intervals.
 * We use the latest observed timestamp as the effective time because it is
 * the closest public evidence of the reset being available.
 */
export function mergeResetEpisodes(records: ResetRecord[], windowMs = EPISODE_WINDOW_MS): ResetRecord[] {
  const sorted = [...records]
    .filter((record) => Number.isFinite(record.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp);
  const episodes: ResetRecord[] = [];

  let episodeAnchor: number | null = null;
  for (const record of sorted) {
    if (episodeAnchor !== null && episodeAnchor - record.timestamp <= windowMs) continue;
    episodes.push(record);
    episodeAnchor = record.timestamp;
  }
  return episodes;
}

export function intervalDays(records: ResetRecord[]): number[] {
  const episodes = mergeResetEpisodes(records);
  const intervals: number[] = [];
  for (let index = 0; index < episodes.length - 1; index += 1) {
    const days = (episodes[index].timestamp - episodes[index + 1].timestamp) / (24 * 60 * 60 * 1000);
    if (days > 0 && days < 100) intervals.push(days);
  }
  return intervals;
}

export function median(values: number[], fallback = 3.8): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
