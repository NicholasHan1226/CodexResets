/**
 * Export and share utilities
 */

import type { UsageTracking, BankedReset } from "@/types/reset";

interface ExportData {
  usageTracking: UsageTracking | null;
  bankedResets: BankedReset[];
  exportedAt: string;
  version: string;
}

/**
 * Export personal data (usage tracking + banked resets) as JSON file
 */
export function exportPersonalData(
  usageTracking: UsageTracking | null,
  bankedResets: BankedReset[]
): void {
  const data: ExportData = {
    usageTracking,
    bankedResets,
    exportedAt: new Date().toISOString(),
    version: "1.0.0",
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `codex-resets-data-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import personal data from JSON file
 */
export function importPersonalData(file: File): Promise<ExportData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as ExportData;
        if (!data.version || !data.exportedAt) {
          reject(new Error("Invalid data format"));
          return;
        }
        resolve(data);
      } catch {
        reject(new Error("Failed to parse JSON file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

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
