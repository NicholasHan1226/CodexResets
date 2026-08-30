import type { PlanningAdvice, ProbabilityPoint, ResetPrediction, ResetRecord, ResetSignal } from '@/types/reset';
import { probabilityWithin, selectForecastModel } from '@/lib/forecast-model';
import { computeIntervalStats, getEffectiveHistory, setDynamicResetHistory } from '@/lib/reset-data';

export { setDynamicResetHistory };

const HOUR_MS = 60 * 60 * 1000;

function generateCurve(
  history: ResetRecord[],
  now: Date,
  model: ReturnType<typeof selectForecastModel>['model'],
): ProbabilityPoint[] {
  const rawPoints: ProbabilityPoint[] = [];
  const start = now.getTime();
  const end = start + 7 * 24 * HOUR_MS;
  const boundaries = new Set<number>([end]);
  // Wall-clock UTC buckets do not drift with each refresh. Split at the exact
  // rolling daily cutoffs too, so the 24h/48h masses remain unchanged.
  for (let at = (Math.floor(start / (3 * HOUR_MS)) + 1) * 3 * HOUR_MS; at < end; at += 3 * HOUR_MS) boundaries.add(at);
  for (let day = 1; day < 7; day++) boundaries.add(start + day * 24 * HOUR_MS);
  let priorCumulative = 0;
  let priorAt = start;
  for (const at of [...boundaries].sort((a, b) => a - b)) {
    const cumulative = probabilityWithin(history, model, start, (at - start) / HOUR_MS);
    const pointAt = new Date(at);
    rawPoints.push({
      startTimestamp: priorAt,
      timestamp: pointAt.getTime(),
      date: pointAt.toISOString().slice(0, 10),
      hour: pointAt.getUTCHours(),
      probability: Math.max(0, cumulative - priorCumulative),
    });
    priorCumulative = Math.max(priorCumulative, cumulative);
    priorAt = at;
  }

  // Keep each day's probability mass intact while using canonical historical
  // announcement hours to place the most likely short window within that day.
  const hourlyCounts = new Array<number>(8).fill(1);
  for (const record of history) hourlyCounts[Math.floor(new Date(record.timestamp).getUTCHours() / 3)] += 1;
  const averageCount = hourlyCounts.reduce((sum, count) => sum + count, 0) / hourlyCounts.length;

  const dayOf = (point: ProbabilityPoint) => Math.floor((point.startTimestamp! - start) / (24 * HOUR_MS));
  const weightOf = (point: ProbabilityPoint) => hourlyCounts[Math.floor(new Date(point.startTimestamp!).getUTCHours() / 3)] / averageCount;
  return rawPoints.map((point) => {
    const dayPoints = rawPoints.filter((item) => dayOf(item) === dayOf(point));
    const baseTotal = dayPoints.reduce((sum, item) => sum + item.probability, 0);
    const weightedTotal = dayPoints.reduce((sum, item) => sum + item.probability * weightOf(item), 0);
    const weight = weightOf(point);
    const probability = weightedTotal > 0 ? point.probability * weight * (baseTotal / weightedTotal) : point.probability;
    return { ...point, probability };
  });
}

function findResetWindow(curve: ProbabilityPoint[]): { start: string; end: string; confidence: number } {
  let maxProbability = 0;
  let bestStart = 0;
  for (let index = 0; index < curve.length - 1; index += 1) {
    const probability = curve[index].probability + (curve[index + 1]?.probability ?? 0);
    if (probability > maxProbability) {
      maxProbability = probability;
      bestStart = index;
    }
  }
  const start: ProbabilityPoint = curve[bestStart] || { timestamp: Date.now() + 3 * HOUR_MS, date: '', hour: 0, probability: 0 };
  // Each point holds probability mass for the three hours ending at its
  // timestamp. A two-point peak therefore begins at the start of the first
  // bucket, not its end; otherwise the advertised six-hour window is shifted
  // three hours later than the curve the visitor is reading.
  const startDate = new Date(start.startTimestamp ?? start.timestamp - 3 * HOUR_MS);
  const endDate = new Date(curve[bestStart + 1]?.timestamp ?? start.timestamp);
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    confidence: Math.round(Math.min(0.85, 0.2 + maxProbability * 4) * 100) / 100,
  };
}

function generateAdvice(probability: number, daysSince: number, medianDays: number): PlanningAdvice {
  const ratio = daysSince / Math.max(medianDays, 0.25);
  if (probability >= 0.5 || ratio >= 1.5) return { level: 'wait' };
  if (probability >= 0.4 || ratio >= 1.0) return { level: 'cautious' };
  if (ratio < 0.5) return { level: 'use_freely' };
  return { level: 'approaching' };
}

function generateOfflineSignals(now: Date): ResetSignal[] {
  const stats = computeIntervalStats();
  const lastReset = getEffectiveHistory()[0];
  const daysSinceLast = lastReset ? Math.max(0, (now.getTime() - lastReset.timestamp) / (24 * HOUR_MS)) : 0;
  const cooldownRatio = stats.medianDays > 0 ? daysSinceLast / stats.medianDays : 0;
  const cooldownValue = Math.min(1, cooldownRatio);
  const cooldownStatus: ResetSignal['status'] = cooldownRatio >= 1.2 ? 'active' : cooldownRatio >= 0.7 ? 'weak' : 'idle';
  const updatedAt = now.getTime();

  return [
    { source: 'tibopost', label: 'Tibo Posting', description: 'signals.tiboUnavailable', value: 0.1, status: 'idle', updatedAt, sourceUrl: 'https://x.com/thsottiaux' },
    { source: 'status_page', label: 'OpenAI Status', description: 'signals.statusDown', value: 0.08, status: 'idle', updatedAt, sourceUrl: 'https://status.openai.com/history' },
    {
      source: 'cooldown', label: 'Time Cooldown', description: 'signals.cooldownDesc',
      descriptionParams: { d: daysSinceLast.toFixed(1), m: stats.medianDays.toFixed(1) },
      value: cooldownValue, status: cooldownStatus, updatedAt,
    },
  ];
}

/**
 * Generates a probability forecast from canonical reset episodes. Logistic
 * and Weibull candidates are scored on time-ordered historical cutoffs and
 * the lower-Brier model is selected automatically. Direct reset announcements
 * drive the delivery pipeline, but never alter a future-facing probability.
 */
export function generatePrediction(records?: ResetRecord[], liveSignals?: ResetSignal[]): ResetPrediction {
  if (records) setDynamicResetHistory(records);

  const now = new Date();
  const history = getEffectiveHistory();
  const selection = selectForecastModel(history);
  const canonicalHistory = selection.episodes;
  const lastReset = canonicalHistory[0]?.timestamp || now.getTime();
  const daysSince = Math.max(0, (now.getTime() - lastReset) / (24 * HOUR_MS));
  const stats = computeIntervalStats();
  const signals = liveSignals || generateOfflineSignals(now);
  const curve = generateCurve(canonicalHistory, now, selection.model);
  const window = findResetWindow(curve);
  const prob24h = probabilityWithin(canonicalHistory, selection.model, now.getTime(), 24);
  const prob48h = probabilityWithin(canonicalHistory, selection.model, now.getTime(), 48);

  return {
    windowStart: window.start,
    windowEnd: window.end,
    confidence: window.confidence,
    prob24h: Math.round(prob24h * 100) / 100,
    prob48h: Math.round(prob48h * 100) / 100,
    curve,
    signals,
    lastReset: new Date(lastReset).toISOString(),
    daysSinceLastReset: Math.round(daysSince * 10) / 10,
    medianIntervalDays: Math.round(stats.medianDays * 10) / 10,
    advice: {
      24: generateAdvice(Math.round(prob24h * 100) / 100, daysSince, stats.medianDays),
      48: generateAdvice(Math.round(prob48h * 100) / 100, daysSince, stats.medianDays),
    },
    modelVersion: `v5-production-${selection.model}`,
    generatedAt: now.getTime(),
  };
}

export function formatDuration(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function formatWindowDate(iso: string): string {
  const date = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} UTC`;
}
