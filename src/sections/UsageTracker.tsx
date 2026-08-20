import { useState, useEffect } from "react";
import { useI18n } from "@/contexts/I18nContext";
import type { UsageTracking } from "@/types/reset";

const STORAGE_KEY = "codex-resets-usage";

function asciiBar(pct: number, width: number = 20): string {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export function UsageTracker() {
  const { t } = useI18n();
  const [tracking, setTracking] = useState<UsageTracking | null>(null);
  const [resetTime, setResetTime] = useState("");
  const [usagePercent, setUsagePercent] = useState(50);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as UsageTracking;
        setTracking(parsed);
        setResetTime(parsed.weeklyResetTime);
        setUsagePercent(parsed.usagePercent);
      } catch {
        // ignore
      }
    }
  }, []);

  const handleSave = () => {
    if (!resetTime) return;
    const data: UsageTracking = {
      weeklyResetTime: resetTime,
      usagePercent,
      updatedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setTracking(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setTracking(null);
    setResetTime("");
    setUsagePercent(50);
  };

  const getSustainability = () => {
    if (!tracking) return null;
    const percent = tracking.usagePercent;
    if (percent >= 90) return { text: t('usage.wontMakeIt'), color: "text-destructive" };
    if (percent >= 70) return { text: t('usage.tight'), color: "text-warning" };
    return { text: t('usage.shouldMakeIt'), color: "text-primary" };
  };

  const sustainability = getSustainability();

  return (
    <section aria-label="Usage tracker" className="max-w-3xl">
      <h2 className="text-lg font-semibold text-foreground">
        <span className="font-mono text-primary">❯</span> codex /status
      </h2>

      <div className="mt-4 space-y-4">
        {/* Reset time input */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">
            {t('usage.weeklyResetTime')}
          </label>
          <input
            type="time"
            value={resetTime}
            onChange={(e) => setResetTime(e.target.value)}
            className="w-full max-w-xs bg-muted border border-border/20 rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>

        {/* Usage slider */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-muted-foreground">
              {t('usage.usageRate')}
            </label>
            <span className="font-mono text-sm font-semibold text-foreground">{usagePercent}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={usagePercent}
            onChange={(e) => setUsagePercent(Number(e.target.value))}
            className="w-full max-w-xs accent-primary"
          />
          {/* ASCII bar */}
          <p className="mt-1 font-mono text-sm text-primary select-none" aria-hidden="true">
            {asciiBar(usagePercent)}
            <span className="text-muted-foreground ml-2">{usagePercent}%</span>
          </p>
        </div>

        {/* Verdict */}
        {sustainability && (
          <p className={`text-sm ${sustainability.color}`}>
            {sustainability.text}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleSave}
            className="font-mono text-xs text-primary hover:underline"
          >
            [{saved ? t('usage.saved') : t('usage.save')}]
          </button>
          {tracking && (
            <button
              onClick={handleReset}
              className="font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              [{t('usage.reset')}]
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
