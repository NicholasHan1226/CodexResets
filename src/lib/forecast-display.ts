import type { ResetSignal } from '@/types/reset';

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

/** Formats an official target in the visitor's local timezone. */
export function formatOfficialScheduleTarget(scheduledAt: number | null, locale: 'en' | 'zh'): string | null {
  if (typeof scheduledAt !== 'number' || !Number.isFinite(scheduledAt)) return null;
  const date = new Date(scheduledAt);
  const language = locale === 'zh' ? 'zh-CN' : 'en-US';
  return `${date.toLocaleDateString(language, { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString(language, {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })}`;
}

/** A compact current-time anchor for a future target or its execution grace period. */
export function formatOfficialScheduleCountdown(
  scheduledAt: number | null,
  now: number,
  locale: 'en' | 'zh',
): string | null {
  if (typeof scheduledAt !== 'number' || !Number.isFinite(scheduledAt)) return null;
  const totalMinutes = Math.ceil((scheduledAt - now) / 60_000);
  if (totalMinutes <= 0) {
    const minutesAfter = Math.ceil((now - scheduledAt) / 60_000);
    if (minutesAfter * 60_000 > OFFICIAL_SCHEDULE_GRACE_MS) return null;
    const remainingMinutes = Math.max(0, Math.floor((OFFICIAL_SCHEDULE_GRACE_MS - minutesAfter * 60_000) / 60_000));
    const afterHours = Math.floor(minutesAfter / 60);
    const afterMinutes = minutesAfter % 60;
    const remainingHours = Math.floor(remainingMinutes / 60);
    const remainingRemainder = remainingMinutes % 60;
    const after = locale === 'zh'
      ? `${afterHours > 0 ? `${afterHours}小时` : ''}${afterMinutes > 0 ? `${afterMinutes}分钟` : ''}` || '0分钟'
      : `${afterHours > 0 ? `${afterHours}h ` : ''}${afterMinutes > 0 ? `${afterMinutes}m` : ''}`.trim() || '0m';
    const remaining = locale === 'zh'
      ? `${remainingHours > 0 ? `${remainingHours}小时` : ''}${remainingRemainder > 0 ? `${remainingRemainder}分钟` : ''}` || '0分钟'
      : `${remainingHours > 0 ? `${remainingHours}h ` : ''}${remainingRemainder > 0 ? `${remainingRemainder}m` : ''}`.trim() || '0m';
    return locale === 'zh' ? `预告后 ${after} · 宽限剩余 ${remaining}` : `${after} after target · ${remaining} grace left`;
  }
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
