import type { ResetSignal } from '@/types/reset';

const HOUR_MS = 60 * 60 * 1000;

export type PrimaryForecast =
  | { kind: 'model' }
  | { kind: 'official-schedule'; scheduledAt: number | null; window: 'within' | 'after' | 'pending' | 'elapsed' };

/**
 * The public answer should incorporate information a visitor already knows.
 * Model probabilities remain history-only calibration inputs, while a direct
 * official schedule replaces the prominent probability readout.
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
  if (scheduledAt <= now) return { kind: 'official-schedule', scheduledAt, window: 'elapsed' };
  return {
    kind: 'official-schedule',
    scheduledAt,
    window: scheduledAt <= now + timeframe * HOUR_MS ? 'within' : 'after',
  };
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

/** A compact current-time anchor for the official-schedule view. */
export function formatOfficialScheduleCountdown(
  scheduledAt: number | null,
  now: number,
  locale: 'en' | 'zh',
): string | null {
  if (typeof scheduledAt !== 'number' || !Number.isFinite(scheduledAt) || scheduledAt <= now) return null;
  const totalMinutes = Math.ceil((scheduledAt - now) / 60_000);
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
