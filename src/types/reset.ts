export interface ResetSignal {
  /** Signal source identifier */
  source: string;
  /** Signal label */
  label: string;
  /** Current signal value (0-1 normalized) */
  value: number;
  /** Signal status */
  status: "active" | "weak" | "idle";
  /** Last updated timestamp */
  updatedAt: number;
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
  /** Model version */
  modelVersion: string;
  /** Generated at timestamp */
  generatedAt: number;
}

export interface HistoricalReset {
  /** Reset time (ISO) */
  time: string;
  /** Interval from previous reset in hours */
  intervalHours: number | null;
  /** Day of week */
  dayOfWeek: string;
}
