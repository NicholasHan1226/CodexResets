import type { ResetPrediction, ResetSignal, ProbabilityPoint, PlanningAdvice, ResetRecord } from "@/types/reset";
import { computeIntervalStats, computeHourlyDistribution, getEffectiveHistory, setDynamicResetHistory } from "@/lib/reset-data";

// Re-export so existing imports from "@/lib/prediction" keep working
export { setDynamicResetHistory };

/**
 * Calculate base probability from time elapsed since last reset.
 * Uses a logistic growth model: probability increases as wait time exceeds median interval.
 */
function baseProbabilityFromCooldown(): number {
  const history = getEffectiveHistory();
  const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);
  const lastReset = sorted[0]?.timestamp || 0;
  const daysSince = (Date.now() - lastReset) / (1000 * 60 * 60 * 24);
  
  // Calculate median interval
  const intervals: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const diff = (sorted[i].timestamp - sorted[i + 1].timestamp) / (1000 * 60 * 60 * 24);
    if (diff > 0 && diff < 100) intervals.push(diff);
  }
  intervals.sort((a, b) => a - b);
  const median = intervals.length > 0 ? intervals[Math.floor(intervals.length / 2)] : 3.8;

  // Logistic curve: P = 1 / (1 + e^(-k * (x - median)))
  const k = 1.5 / median;
  const prob = 1 / (1 + Math.exp(-k * (daysSince - median)));

  // Cap at 0.85 — never fully certain
  return Math.min(0.85, prob);
}

/**
 * Calculate time-of-day weighting based on historical reset announcement hours.
 */
function timeOfDayWeight(utcHour: number): number {
  const dist = computeHourlyDistribution();
  const maxCount = Math.max(...dist);
  if (maxCount === 0) return 1;
  return 0.3 + 0.7 * (dist[utcHour] / maxCount);
}

/**
 * Generate 7-day probability curve using real statistics.
 */
function generateCurve(now: Date): ProbabilityPoint[] {
  const points: ProbabilityPoint[] = [];
  const baseDate = new Date(now);
  baseDate.setUTCHours(0, 0, 0, 0);

  const baseProb = baseProbabilityFromCooldown();

  for (let d = 0; d < 7; d++) {
    const date = new Date(baseDate);
    date.setUTCDate(date.getUTCDate() + d);
    const dateStr = date.toISOString().split("T")[0];

    for (let h = 0; h < 24; h += 3) {
      const todWeight = timeOfDayWeight(h);
      // Decay factor: closer hours get more weight
      const hoursFromNow = (d * 24 + h) - (now.getUTCHours());
      const decay = hoursFromNow <= 0 ? 0.3 : Math.max(0.3, 1 - hoursFromNow / 168);

      const prob = baseProb * todWeight * decay * 0.15;

      points.push({
        date: dateStr,
        hour: h,
        probability: Math.round(Math.min(0.35, prob) * 1000) / 1000,
      });
    }
  }

  return points;
}

/**
 * Find the most likely reset window (6-hour block with highest cumulative probability).
 */
function findResetWindow(curve: ProbabilityPoint[]): { start: string; end: string; confidence: number } {
  let maxProb = 0;
  let bestStart = 0;

  for (let i = 0; i < curve.length - 1; i++) {
    const windowProb = curve[i].probability + (curve[i + 1]?.probability ?? 0);
    if (windowProb > maxProb) {
      maxProb = windowProb;
      bestStart = i;
    }
  }

  const startDate = new Date(`${curve[bestStart].date}T${String(curve[bestStart].hour).padStart(2, "0")}:00:00Z`);
  const endDate = new Date(startDate);
  endDate.setUTCHours(endDate.getUTCHours() + 6);

  const confidence = Math.min(0.85, maxProb * 4 + 0.2);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * Planning advice level — copy lives in i18n (`advice.<level>`), not here,
 * so zh visitors don't get English sentences from the model layer.
 */
function generateAdvice(prob24h: number, prob48h: number, daysSince: number, medianDays: number): PlanningAdvice {
  const ratio = daysSince / medianDays;

  if (prob24h >= 0.5 || ratio >= 1.5) return { level: "wait" };
  if (prob48h >= 0.4 || ratio >= 1.0) return { level: "cautious" };
  if (ratio < 0.5) return { level: "use_freely" };
  return { level: "approaching" };
}

/**
 * Generate signals based on real data patterns.
 */
function generateSignals(now: Date): ResetSignal[] {
  const stats = computeIntervalStats();
  const lastReset = getEffectiveHistory()[0];
  const daysSinceLast = (now.getTime() - lastReset.timestamp) / (1000 * 60 * 60 * 24);

  // Cooldown is the ONLY signal the offline model can honestly compute —
  // everything else needs network sources that have already failed by the
  // time this fallback runs. Mark those unavailable instead of fabricating
  // activity from cooldown arithmetic.
  // NOTE: stats.medianDays is already in days — do not divide again.
  const cooldownRatio = stats.medianDays > 0 ? daysSinceLast / stats.medianDays : 0;
  const cooldownValue = Math.min(1, cooldownRatio);
  const cooldownStatus: ResetSignal["status"] = cooldownRatio >= 1.2 ? "active" : cooldownRatio >= 0.7 ? "weak" : "idle";

  const computedAt = Date.now();

  return [
    {
      source: "tibopost",
      label: "Tibo Posting",
      description: "signals.tiboUnavailable",
      value: 0.1,
      status: "idle",
      updatedAt: computedAt,
      sourceUrl: "https://x.com/thsottiaux",
    },
    {
      source: "status_page",
      label: "OpenAI Status",
      description: "signals.statusDown",
      value: 0.08,
      status: "idle",
      updatedAt: computedAt,
      sourceUrl: "https://status.openai.com/history",
    },
    {
      source: "cooldown",
      label: "Time Cooldown",
      description: "signals.cooldownDesc",
      descriptionParams: { d: daysSinceLast.toFixed(1), m: stats.medianDays.toFixed(1) },
      value: cooldownValue,
      status: cooldownStatus,
      updatedAt: computedAt,
    },
    {
      source: "launch_noise",
      label: "Launch Noise",
      description: "signals.launchQuiet",
      value: 0.08,
      status: "idle",
      updatedAt: computedAt,
    },
  ];
}

/**
 * Generate the full prediction model using real reset history.
 * @param records Optional reset records to use instead of static data
 */
export function generatePrediction(records?: ResetRecord[]): ResetPrediction {
  // Set dynamic history if provided
  if (records) {
    setDynamicResetHistory(records);
  }
  
  const now = new Date();
  const history = getEffectiveHistory();
  const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);
  const lastReset = sorted[0]?.timestamp || 0;
  const daysSince = (Date.now() - lastReset) / (1000 * 60 * 60 * 24);
  
  // Calculate median interval
  const intervals: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const diff = (sorted[i].timestamp - sorted[i + 1].timestamp) / (1000 * 60 * 60 * 24);
    if (diff > 0 && diff < 100) intervals.push(diff);
  }
  intervals.sort((a, b) => a - b);
  const median = intervals.length > 0 ? intervals[Math.floor(intervals.length / 2)] : 3.8;
  
  const signals = generateSignals(now);
  const curve = generateCurve(now);
  const window = findResetWindow(curve);

  // Calculate 24h and 48h probabilities from curve
  const prob24h = curve
    .filter((p) => {
      const pointDate = new Date(`${p.date}T${String(p.hour).padStart(2, "0")}:00:00Z`);
      const diff = pointDate.getTime() - now.getTime();
      return diff > 0 && diff <= 24 * 60 * 60 * 1000;
    })
    .reduce((sum, p) => sum + p.probability, 0);

  const prob48h = curve
    .filter((p) => {
      const pointDate = new Date(`${p.date}T${String(p.hour).padStart(2, "0")}:00:00Z`);
      const diff = pointDate.getTime() - now.getTime();
      return diff > 0 && diff <= 48 * 60 * 60 * 1000;
    })
    .reduce((sum, p) => sum + p.probability, 0);

  const advice = generateAdvice(prob24h, prob48h, daysSince, median);

  return {
    windowStart: window.start,
    windowEnd: window.end,
    confidence: window.confidence,
    prob24h: Math.min(0.95, Math.round(prob24h * 100) / 100),
    prob48h: Math.min(0.98, Math.round(prob48h * 100) / 100),
    curve,
    signals,
    lastReset: new Date(lastReset).toISOString(),
    daysSinceLastReset: Math.round(daysSince * 10) / 10,
    medianIntervalDays: Math.round(median * 10) / 10,
    advice,
    modelVersion: "v3.0-real",
    generatedAt: Date.now(),
  };
}

/**
 * Format duration in ms to human-readable countdown string.
 */
export function formatDuration(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/**
 * Format a date to a readable string.
 */
export function formatWindowDate(iso: string): string {
  const date = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getUTCMonth()];
  const day = date.getUTCDate();
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${month} ${day} ${hour}:${minute} UTC`;
}
