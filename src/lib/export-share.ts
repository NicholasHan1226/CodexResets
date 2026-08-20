/**
 * Share utilities
 */

/**
 * Share current prediction state via URL
 */
export function sharePredictionState(state: {
  probability24h: number;
  probability48h: number;
  daysSinceLastReset: number;
  medianInterval: number;
}): string {
  const params = new URLSearchParams({
    p24: state.probability24h.toFixed(0),
    p48: state.probability48h.toFixed(0),
    days: state.daysSinceLastReset.toFixed(1),
    median: state.medianInterval.toFixed(1),
  });
  return `${window.location.origin}?${params.toString()}`;
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

export interface ShareTarget {
  id: "x" | "hn" | "reddit" | "telegram";
  label: string;
  url: string;
}

/**
 * Build platform share intent URLs (X / Hacker News / Reddit / Telegram)
 */
export function buildShareTargets(text: string, url: string): ShareTarget[] {
  const e = encodeURIComponent;
  return [
    {
      id: "x",
      label: "x",
      url: `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(url)}`,
    },
    {
      id: "hn",
      label: "hn",
      url: `https://news.ycombinator.com/submitlink?u=${e(url)}&t=${e(text)}`,
    },
    {
      id: "reddit",
      label: "reddit",
      url: `https://www.reddit.com/submit?url=${e(url)}&title=${e(text)}`,
    },
    {
      id: "telegram",
      label: "telegram",
      url: `https://t.me/share/url?url=${e(url)}&text=${e(text)}`,
    },
  ];
}

/**
 * Whether the native Web Share API is available (mostly mobile browsers)
 */
export function canNativeShare(): boolean {
  return typeof navigator !== "undefined" && !!navigator.share;
}
