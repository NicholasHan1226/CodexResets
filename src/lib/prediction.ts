import type { ResetPrediction, ResetSignal, ProbabilityPoint, HistoricalReset } from "@/types/reset";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Generate simulated signal data based on time-of-day patterns.
 * In a real app, these would come from actual API monitoring endpoints.
 */
function generateSignals(now: Date): ResetSignal[] {
  const hour = now.getUTCHours();
  const dayOfWeek = now.getUTCDay();

  // Simulate signal strengths based on known patterns
  // OpenAI tends to reset during low-traffic US hours
  const isUSNight = hour >= 6 && hour <= 14; // ~night in US Pacific
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  return [
    {
      source: "api_latency",
      label: "API Latency Anomaly",
      value: isUSNight ? 0.7 + Math.random() * 0.2 : 0.2 + Math.random() * 0.3,
      status: isUSNight ? "active" : "weak",
      updatedAt: Date.now() - Math.floor(Math.random() * 300000),
    },
    {
      source: "rate_limit_pattern",
      label: "Rate Limit Pattern Shift",
      value: isUSNight ? 0.6 + Math.random() * 0.3 : 0.1 + Math.random() * 0.2,
      status: isUSNight ? "active" : "idle",
      updatedAt: Date.now() - Math.floor(Math.random() * 600000),
    },
    {
      source: "community_reports",
      label: "Community Reset Reports",
      value: isWeekend ? 0.5 + Math.random() * 0.3 : 0.3 + Math.random() * 0.2,
      status: isWeekend ? "active" : "weak",
      updatedAt: Date.now() - Math.floor(Math.random() * 900000),
    },
    {
      source: "error_rate_spike",
      label: "429 Error Rate Spike",
      value: isUSNight ? 0.5 + Math.random() * 0.4 : 0.05 + Math.random() * 0.15,
      status: isUSNight ? "active" : "idle",
      updatedAt: Date.now() - Math.floor(Math.random() * 180000),
    },
    {
      source: "historical_cycle",
      label: "Historical Cycle Match",
      value: 0.65 + Math.random() * 0.15,
      status: "active",
      updatedAt: Date.now(),
    },
  ];
}

/**
 * Generate 7-day probability curve
 */
function generateCurve(now: Date): ProbabilityPoint[] {
  const points: ProbabilityPoint[] = [];
  const baseDate = new Date(now);
  baseDate.setUTCHours(0, 0, 0, 0);

  for (let d = 0; d < 7; d++) {
    const date = new Date(baseDate);
    date.setUTCDate(date.getUTCDate() + d);
    const dateStr = date.toISOString().split("T")[0];
    const dayOfWeek = date.getUTCDay();

    for (let h = 0; h < 24; h += 3) {
      // Higher probability during US night hours (UTC 6-14)
      const isNightWindow = h >= 6 && h <= 14;
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isToday = d === 0;
      const isTomorrow = d === 1;

      let baseProb = 0.02;
      if (isNightWindow) baseProb = 0.08;
      if (isWeekend) baseProb += 0.03;
      if (isToday) baseProb *= 1.5;
      if (isTomorrow) baseProb *= 1.2;

      // Add some noise
      const prob = Math.min(0.35, baseProb + (Math.random() * 0.03 - 0.015));

      points.push({
        date: dateStr,
        hour: h,
        probability: Math.round(prob * 1000) / 1000,
      });
    }
  }

  return points;
}

/**
 * Find the most likely reset window
 */
function findResetWindow(_now: Date, curve: ProbabilityPoint[]): { start: string; end: string; confidence: number } {
  // Find the 6-hour window with highest cumulative probability
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

  const confidence = Math.min(0.85, maxProb * 3 + 0.3);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * Generate the full prediction model
 */
export function generatePrediction(): ResetPrediction {
  const now = new Date();
  const signals = generateSignals(now);
  const curve = generateCurve(now);
  const window = findResetWindow(now, curve);

  // Calculate 24h and 48h probabilities from curve
  const prob24h = curve
    .filter((p) => {
      const pointDate = new Date(`${p.date}T${String(p.hour).padStart(2, "0")}:00:00Z`);
      return pointDate.getTime() - now.getTime() <= 24 * 60 * 60 * 1000 && pointDate.getTime() > now.getTime();
    })
    .reduce((sum, p) => sum + p.probability, 0);

  const prob48h = curve
    .filter((p) => {
      const pointDate = new Date(`${p.date}T${String(p.hour).padStart(2, "0")}:00:00Z`);
      const diff = pointDate.getTime() - now.getTime();
      return diff <= 48 * 60 * 60 * 1000 && diff > 0;
    })
    .reduce((sum, p) => sum + p.probability, 0);

  // Simulate last reset ~3 days ago
  const lastReset = new Date(now);
  lastReset.setDate(lastReset.getDate() - 3);
  lastReset.setHours(10, 0, 0, 0);

  return {
    windowStart: window.start,
    windowEnd: window.end,
    confidence: window.confidence,
    prob24h: Math.min(0.95, Math.round(prob24h * 100) / 100),
    prob48h: Math.min(0.98, Math.round(prob48h * 100) / 100),
    curve,
    signals,
    lastReset: lastReset.toISOString(),
    modelVersion: "v2.4-signal",
    generatedAt: Date.now(),
  };
}

/**
 * Historical reset data (simulated)
 */
export function getHistoricalResets(): HistoricalReset[] {
  const now = new Date();
  const resets: HistoricalReset[] = [];

  // Generate 12 historical resets
  for (let i = 1; i <= 12; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i * 4 - Math.floor(Math.random() * 2));
    const dayOfWeek = DAY_NAMES[date.getDay()];

    const prevReset = i < 12 ? resets[i - 2] : null;
    const intervalHours = prevReset
      ? Math.round((date.getTime() - new Date(prevReset.time).getTime()) / (1000 * 60 * 60))
      : null;

    resets.push({
      time: date.toISOString(),
      intervalHours,
      dayOfWeek,
    });
  }

  return resets.reverse();
}

/**
 * Format a duration in milliseconds to human readable
 */
export function formatDuration(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return { days, hours, minutes, seconds };
}

/**
 * Format time to HH:MM in UTC
 */
export function formatUTCTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

/**
 * Format date to MMM DD
 */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
