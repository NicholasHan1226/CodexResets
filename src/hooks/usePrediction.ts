import { useState, useEffect, useCallback } from "react";
import { generatePrediction, formatDuration } from "@/lib/prediction";
import type { ResetPrediction } from "@/types/reset";

/**
 * Hook that manages the reset prediction state.
 * Refreshes data every 30 seconds.
 */
export function usePrediction() {
  const [prediction, setPrediction] = useState<ResetPrediction | null>(null);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isLive, setIsLive] = useState(true);

  const refresh = useCallback(() => {
    const data = generatePrediction();
    setPrediction(data);
  }, []);

  // Initial load and periodic refresh
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Countdown timer — counts toward the start of the predicted window
  useEffect(() => {
    if (!prediction) return;

    const updateCountdown = () => {
      const windowStart = new Date(prediction.windowStart).getTime();
      const now = Date.now();
      const diff = Math.max(0, windowStart - now);
      setCountdown(formatDuration(diff));
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [prediction]);

  return { prediction, countdown, isLive, setIsLive, refresh };
}
