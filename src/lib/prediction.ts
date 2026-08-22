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
  let priorCumulative = 0;

  for (let horizonHours = 3; horizonHours <= 7 * 24; horizonHours += 3) {
    const cumulative = probabilityWithin(history, model, now.getTime(), horizonHours);
    const pointAt = new Date(now.getTime() + horizonHours * HOUR_MS);
    rawPoints.push({
      date: pointAt.toISOString().slice(0, 10),
      hour: pointAt.getUTCHours(),
      probability: Math.round(Math.max(0, cumulative - priorCumulative) * 1000) / 1000,
    });
    priorCumulative = Math.max(priorCumulative, cumulative);
  }

  // Keep each day's probability mass intact while using canonical historical
  // announcement hours to place the most likely short window within that day.
  const hourlyCounts = new Array<number>(8).fill(1);
  for (const record of history) hourlyCounts[Math.floor(new Date(record.timestamp).getUTCHours() / 3)] += 1;
  const averageCount = hourlyCounts.reduce((sum, count) => sum + count, 0) / hourlyCounts.length;

  return rawPoints.map((point, index) => {
    const dayStart = Math.floor(index / 8) * 8;
    const dayPoints = rawPoints.slice(dayStart, dayStart + 8);
    const baseTotal = dayPoints.reduce((sum, item) => sum + item.probability, 0);
    const weightedTotal = dayPoints.reduce((sum, item) => sum + item.probability * (hourlyCounts[Math.floor(item.hour / 3)] / averageCount), 0);
    const weight = hourlyCounts[Math.floor(point.hour / 3)] / averageCount;
    const probability = weightedTotal > 0 ? point.probability * weight * (baseTotal / weightedTotal) : point.probability;
    return { ...point, probability: Math.round(probability * 1000) / 1000 };
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
  const start = curve[bestStart] || { date: new Date().toISOString().slice(0, 10), hour: 0 };
  const startDate = new Date(`${start.date}T${String(start.hour).padStart(2, '0')}:00:00Z`);
  const endDate = new Date(startDate.getTime() + 6 * HOUR_MS);
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    confidence: Math.round(Math.min(0.85, 0.2 + maxProbability * 4) * 100) / 100,
  };
}

function generateAdvice(prob24h: number, prob48h: number, daysSince: number, medianDays: number): PlanningAdvice {
  const ratio = daysSince / Math.max(medianDays, 0.25);
  if (prob24h >= 0.5 || ratio >= 1.5) return { level: 'wait' };
  if (prob48h >= 0.4 || ratio >= 1.0) return { level: 'cautious' };
  if (ratio < 0.5) return { level: 'use_freely' };
  return { level: 'approaching' };
}

function generateOfflineSignals(now: Date): ResetSignal[] {
  const stats = computeIntervalStats();
  const lastReset = getEffectiveHistory()[0];
  const daysSinceLast = (now.getTime() - lastReset.timestamp) / (24 * HOUR_MS);
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
    { source: 'launch_noise', label: 'Launch Noise', description: 'signals.launchQuiet', value: 0.08, status: 'idle', updatedAt },
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
    advice: generateAdvice(prob24h, prob48h, daysSince, stats.medianDays),
    modelVersion: `v4-episode-${selection.model}`,
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
