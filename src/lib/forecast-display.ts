// Relative import keeps this exact display calculation usable by the Worker
// as well as the Vite browser bundle.
import type { ProbabilityPoint, ResetSignal } from '../types/reset';

const HOUR_MS = 60 * 60 * 1000;
export const OFFICIAL_SCHEDULE_GRACE_MS = 6 * HOUR_MS;

export type PrimaryForecast =
  | { kind: 'model' }
  | { kind: 'official-schedule'; scheduledAt: number | null; window: 'within' | 'after' | 'pending' | 'grace' | 'elapsed' };

/**
 * The public answer should incorporate information a visitor already knows.
 * Model probabilities remain history-only calibration inputs, while a direct
 * official schedule is shown beside the prominent probability readout.
 */
export function getPrimaryForecast(
  signals: ResetSignal[],
  timeframe: 24 | 48,
  now = Date.now(),
): PrimaryForecast {
  const officialSchedule = signals.find(
    (signal) => signal.source === 'tibopost'
      && (signal.description === 'signals.resetScheduled' || signal.description === 'signals.resetScheduleElapsed')
      && signal.status === 'active',
  );
  if (!officialSchedule) return { kind: 'model' };

  const scheduledAt = officialSchedule.scheduledAt;
  if (typeof scheduledAt !== 'number' || !Number.isFinite(scheduledAt)) {
    return { kind: 'official-schedule', scheduledAt: null, window: 'pending' };
  }
  if (scheduledAt <= now) {
    return {
      kind: 'official-schedule',
      scheduledAt,
      window: now - scheduledAt <= OFFICIAL_SCHEDULE_GRACE_MS ? 'grace' : 'elapsed',
    };
  }
  return {
    kind: 'official-schedule',
    scheduledAt,
    window: scheduledAt <= now + timeframe * HOUR_MS ? 'within' : 'after',
  };
}

/**
 * Produces the visitor-facing planning likelihood. A direct official target
 * can strengthen a window while it falls inside that exact window, or during
 * the short post-target execution grace period. The history model remains
 * untouched for calibration and scoring.
 */
export function getPlanningProbability(
  historyProbability: number,
  signals: ResetSignal[],
  primaryForecast: PrimaryForecast,
): number {
  const base = Math.min(1, Math.max(0, historyProbability));
  if (primaryForecast.kind !== 'official-schedule' || (primaryForecast.window !== 'within' && primaryForecast.window !== 'grace')) return base;

  const officialStrength = signals.find(
    (signal) => signal.source === 'tibopost'
      && signal.status === 'active'
      && (signal.description === 'signals.resetScheduled' || signal.description === 'signals.resetScheduleElapsed'),
  )?.value;
  if (typeof officialStrength !== 'number' || !Number.isFinite(officialStrength)) return base;

  const support = Math.min(1, Math.max(0, officialStrength));
  return 1 - (1 - base) * (1 - support);
}

/**
 * Applies the direct official timing support to the display-only timing
 * distribution. The persisted historical curve remains untouched for model
 * selection and calibration.
 */
export function alignTimingCurveWithOfficialSchedule(
  curve: ProbabilityPoint[],
  planningProbability: number | undefined,
  scheduledAt: number | null | undefined,
  hours: 24 | 48 | undefined,
  now = Date.now(),
): ProbabilityPoint[] {
  if (typeof planningProbability !== 'number' || !Number.isFinite(planningProbability)
    || typeof scheduledAt !== 'number' || !Number.isFinite(scheduledAt)
    || hours === undefined || scheduledAt <= now || scheduledAt > now + hours * HOUR_MS) return curve;

  const bucketIndex = curve.findIndex((point) => scheduledAt > point.timestamp - 3 * HOUR_MS && scheduledAt <= point.timestamp);
  if (bucketIndex < 0) return curve;

  const modelProbability = curve
    .filter((point) => point.timestamp <= now + hours * HOUR_MS)
    .reduce((sum, point) => sum + point.probability, 0);
  const lift = Math.max(0, planningProbability - modelProbability);
  if (lift === 0) return curve;

  return curve.map((point, index) => index === bucketIndex
    ? { ...point, probability: Math.min(1, point.probability + lift) }
    : point);
}

/** Formats an official target in the visitor's local timezone. */
export function formatOfficialScheduleTarget(scheduledAt: number | null, locale: 'en' | 'zh'): string | null {
  if (typeof scheduledAt !== 'number' || !Number.isFinite(scheduledAt)) return null;
  const date = new Date(scheduledAt);
  const language = locale === 'zh' ? 'zh-CN' : 'en-US';
  return `${date.toLocaleDateString(language, { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString(language, {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })}`;
}

/** A compact current-time anchor for a future official target. */
export function formatOfficialScheduleCountdown(
  scheduledAt: number | null,
  now: number,
  locale: 'en' | 'zh',
): string | null {
  if (typeof scheduledAt !== 'number' || !Number.isFinite(scheduledAt)) return null;
  const totalMinutes = Math.ceil((scheduledAt - now) / 60_000);
  if (totalMinutes <= 0) return null;
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (locale === 'zh') {
    const parts = [days > 0 ? `${days}天` : '', hours > 0 ? `${hours}小时` : '', minutes > 0 ? `${minutes}分钟` : ''].filter(Boolean);
    return `距现在约 ${parts.join('') || '0分钟'}`;
  }
  const parts = [days > 0 ? `${days}d` : '', hours > 0 ? `${hours}h` : '', minutes > 0 ? `${minutes}m` : ''].filter(Boolean);
  return `~${parts.join(' ') || '0m'} from now`;
}
