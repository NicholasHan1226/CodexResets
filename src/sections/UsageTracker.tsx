import { useState, useEffect } from "react";
import { useI18n } from "@/contexts/I18nContext";
import type { UsageTracking } from "@/types/reset";
import { Terminal, Save, RotateCcw } from "lucide-react";

const STORAGE_KEY = "codex-resets-usage";

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
    if (percent >= 90) return { text: t('usage.wontMakeIt'), color: "text-destructive", bgColor: "bg-destructive/10" };
    if (percent >= 70) return { text: t('usage.tight'), color: "text-warning", bgColor: "bg-warning/10" };
    return { text: t('usage.shouldMakeIt'), color: "text-primary", bgColor: "bg-primary/10" };
  };

  const sustainability = getSustainability();

  const getBarColor = () => {
    if (usagePercent >= 90) return "bg-destructive";
    if (usagePercent >= 70) return "bg-warning";
    return "bg-primary";
  };

  return (
    <section className="bg-card rounded-lg shadow-card p-6" aria-label="Usage tracker">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="font-mono text-sm">codex /status</span>
        </h2>
        <span className="text-[11px] font-mono text-muted-foreground">local storage</span>
      </div>

      <div className="mt-5 space-y-5">
        {/* Reset time */}
        <div>
          <label className="text-[11px] text-muted-foreground mb-1.5 block">
            {t('usage.weeklyResetTime')}
          </label>
          <input
            type="time"
            value={resetTime}
            onChange={(e) => setResetTime(e.target.value)}
            className="w-full rounded-lg bg-muted border border-border/10 px-4 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
          />
        </div>

        {/* Usage slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] text-muted-foreground">
              {t('usage.usageRate')}
            </label>
            <span className="text-sm font-mono font-bold text-foreground">{usagePercent}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={usagePercent}
            onChange={(e) => setUsagePercent(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-muted [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_8px_hsl(var(--primary)/0.4)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
          />
          {/* Visual bar */}
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getBarColor()}`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          {/* Scale labels */}
          <div className="flex justify-between mt-1.5 text-[11px] font-mono text-muted-foreground">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Sustainability verdict */}
        {sustainability && (
          <div className={`flex items-center gap-2.5 rounded-lg ${sustainability.bgColor} px-4 py-3`}>
            <div className={`w-2 h-2 rounded-full ${sustainability.color.replace('text-', 'bg-')} shrink-0`} />
            <span className={`text-xs font-medium ${sustainability.color}`}>
              {sustainability.text}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saved ? t('usage.saved') : t('usage.save')}
          </button>
          {tracking && (
            <button
              onClick={handleReset}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-muted text-muted-foreground px-4 py-2 text-xs font-medium hover:text-foreground hover:bg-muted/80 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('usage.reset')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
