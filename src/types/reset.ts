export interface ResetRecord {
  /** Unique identifier */
  id: string;
  /** Reset date in YYYY-MM-DD format */
  date: string;
  /** Reset timestamp in milliseconds */
  timestamp: number;
  /** Reason for the reset */
  reason: string;
  /** Source URL (e.g., tweet link) */
  source?: string;
  /** Whether this reset is verified */
  verified?: boolean;
}

export interface ResetSignal {
  /** Signal source identifier */
  source: string;
  /** Signal label */
  label: string;
  /** Short description of current state */
  description: string;
  /** Current signal value (0-1 normalized) */
  value: number;
  /** Signal status */
  status: "active" | "weak" | "idle";
  /** Last updated timestamp */
  updatedAt: number;
  /** Optional link to source */
  sourceUrl?: string;
}

export interface ProbabilityPoint {
  /** ISO date string */
  date: string;
  /** Hour of day (0-23) */
  hour: number;
  /** Probability 0-1 */
  probability: number;
}

export interface ResetPrediction {
  /** Predicted reset window start (ISO) */
  windowStart: string;
  /** Predicted reset window end (ISO) */
  windowEnd: string;
  /** Confidence 0-1 */
  confidence: number;
  /** 24h probability */
  prob24h: number;
  /** 48h probability */
  prob48h: number;
  /** 7-day probability curve */
  curve: ProbabilityPoint[];
  /** Active signals */
  signals: ResetSignal[];
  /** Last known reset time (ISO) */
  lastReset: string;
  /** Days since last reset */
  daysSinceLastReset: number;
  /** Median interval in days */
  medianIntervalDays: number;
  /** Planning advice based on current probability */
  advice: PlanningAdvice;
  /** Model version */
  modelVersion: string;
  /** Generated at timestamp */
  generatedAt: number;
}

export type AdviceLevel = "use_freely" | "cautious" | "wait" | "critical";

export interface PlanningAdvice {
  /** Advice level */
  level: AdviceLevel;
  /** Human-readable advice text */
  text: string;
  /** Advice color class */
  color: string;
}

export interface HistoricalReset {
  /** Reset time (ISO) */
  time: string;
  /** Interval from previous reset in hours */
  intervalHours: number | null;
  /** Day of week abbreviation */
  dayOfWeek: string;
  /** Reason text */
  reason: string;
}

export interface BankedReset {
  /** Unique ID */
  id: string;
  /** Date when the banked reset was issued */
  issueDate: string;
  /** Expiry date (issueDate + 30 days) */
  expiryDate: string;
  /** Whether it has been used */
  used: boolean;
}

export interface UsageTracking {
  /** Weekly window reset time (HH:MM format) */
  weeklyResetTime: string;
  /** Current usage percentage (0-100) */
  usagePercent: number;
  /** Last updated timestamp */
  updatedAt: number;
}
