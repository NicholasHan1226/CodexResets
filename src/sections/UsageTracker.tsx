import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { UsageTracking } from "@/types/reset";
import { Terminal, Save, RotateCcw } from "lucide-react";

const STORAGE_KEY = "codex-resets-usage";

export function UsageTracker() {
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

  // Calculate "can you make it?" status
  const getSustainability = () => {
    if (!tracking) return null;
    const percent = tracking.usagePercent;
    if (percent >= 90) return { text: "You won't make it. Consider using a banked reset.", color: "text-destructive" };
    if (percent >= 70) return { text: "Tight. Avoid heavy tasks until reset.", color: "text-amber-500" };
    return { text: "You should make it to the reset.", color: "text-primary" };
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
        {/* Weekly reset time input */}
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">Weekly reset time</label>
          <input
            type="time"
            value={resetTime}
            onChange={(e) => setResetTime(e.target.value)}
            className="w-full rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Usage percentage slider */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] text-muted-foreground">Usage rate</label>
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
          {/* Progress bar visualization */}
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

        {/* Sustainability check */}
        {sustainability && (
          <div className={`text-xs ${sustainability.color}`}>
            {sustainability.text}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={handleSave} size="sm" className="flex-1 h-7 text-xs">
            <Save className="h-3 w-3 mr-1" />
            {saved ? "Saved!" : "Save"}
          </Button>
          {tracking && (
            <Button onClick={handleReset} size="sm" variant="ghost" className="h-7 text-xs">
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
