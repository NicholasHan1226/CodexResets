/**
 * Share utilities
 */

/**
 * Wordle-style shareable summary — terminal vocabulary, plain text.
 * The URL stays clean (shared state params were never read back; the
 * destination always shows fresher live data anyway).
 */
export function buildShareSummary(state: {
  pct: number;
  hours: 24 | 48;
  daysSince: number;
  medianDays: number;
  officialSchedule?: { targetLabel: string | null; window: 'within' | 'after' | 'pending' | 'elapsed' };
}, locale: 'en' | 'zh' = 'en'): string {
  if (state.officialSchedule) {
    const target = state.officialSchedule.targetLabel;
    const relation = state.officialSchedule.window === 'within'
      ? (locale === 'zh' ? `在未来 ${state.hours} 小时内` : `within ${state.hours}h`)
      : state.officialSchedule.window === 'after'
        ? (locale === 'zh' ? `在未来 ${state.hours} 小时之后` : `after ${state.hours}h`)
        : state.officialSchedule.window === 'elapsed'
          ? (locale === 'zh' ? '预告时间已过，等待确认' : 'target passed, confirmation pending')
        : (locale === 'zh' ? '时间待确认' : 'time pending confirmation');
    return locale === 'zh'
      ? `Codex 重置预判 ❯ 官方已预告${target ? `：${target}` : ''}（${relation}）`
      : `codex resets ❯ official schedule${target ? `: ${target}` : ''} (${relation})`;
  }
  const filled = Math.max(0, Math.min(10, Math.round((state.pct / 100) * 10)));
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  if (locale === 'zh') {
    return [
      `Codex 重置预判 ❯ 未来 ${state.hours} 小时 ${state.pct}%`,
      `${bar} ${state.pct}% · 已等待 ${state.daysSince.toFixed(1)} 天 · 中位间隔 ${state.medianDays.toFixed(1)} 天`,
    ].join('\n');
  }
  return [
    `codex resets ❯ ${state.pct}% in ${state.hours}h`,
    `${bar} ${state.pct}% · waited ${state.daysSince.toFixed(1)}d · median ${state.medianDays.toFixed(1)}d`,
  ].join('\n');
}

/** Canonical share target — the live site root. */
export function shareUrl(): string {
  return window.location.origin;
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  }
}

/**
 * Share via Web Share API (mobile-friendly)
 */
export async function shareViaWebAPI(title: string, text: string, url: string): Promise<boolean> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Whether the native Web Share API is available (mostly mobile browsers)
 */
export function canNativeShare(): boolean {
  return typeof navigator !== "undefined" && !!navigator.share;
}
