import { useState, useEffect } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    if (percent >= 90) return { text: t('usage.wontMakeIt'), color: "text-destructive" };
    if (percent >= 70) return { text: t('usage.tight'), color: "text-amber-500" };
    return { text: t('usage.shouldMakeIt'), color: "text-primary" };
  };

  const sustainability = getSustainability();

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Terminal className="h-4 w-4" />
          <span className="font-mono">codex /status</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">{t('usage.weeklyResetTime')}</label>
          <input
            type="time"
            value={resetTime}
            onChange={(e) => setResetTime(e.target.value)}
            className="w-full rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] text-muted-foreground">{t('usage.usageRate')}</label>
            <span className="text-xs font-mono text-foreground">{usagePercent}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={usagePercent}
            onChange={(e) => setUsagePercent(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-muted [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
          />
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${usagePercent}%`,
                background: usagePercent >= 90
                  ? "hsl(var(--destructive))"
                  : usagePercent >= 70
                    ? "hsl(38 92% 50%)"
                    : "hsl(162 82% 35%)",
              }}
            />
          </div>
        </div>

        {sustainability && (
          <div className={`text-xs ${sustainability.color}`}>
            {sustainability.text}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleSave} size="sm" className="flex-1 h-7 text-xs">
            <Save className="h-3 w-3 mr-1" />
            {saved ? t('usage.saved') : t('usage.save')}
          </Button>
          {tracking && (
            <Button onClick={handleReset} size="sm" variant="ghost" className="h-7 text-xs">
              <RotateCcw className="h-3 w-3 mr-1" />
              {t('usage.reset')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
