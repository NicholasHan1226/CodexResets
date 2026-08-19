import { useState, useEffect, useCallback } from "react";
import { generatePrediction } from "@/lib/prediction";
import { getSignalsWithFallback } from "@/lib/signal-fetcher";
import type { ResetPrediction } from "@/types/reset";

/**
 * Hook that manages the reset prediction state.
 * Fetches real signals from public sources (Tibo tweets, OpenAI status page)
 * and falls back to simulated data if real fetch fails.
 * Refreshes data every 5 minutes (signals are cached).
 */
export function usePrediction() {
  const [prediction, setPrediction] = useState<ResetPrediction | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [usingRealData, setUsingRealData] = useState(false);

  const refresh = useCallback(async () => {
    setSignalsLoading(true);
    
    try {
      // Generate base prediction from historical data
      const data = generatePrediction();
      
      // Try to fetch real signals
      const { signals, hasRealData } = await getSignalsWithFallback(data.signals);
      setUsingRealData(hasRealData);
      
      // Update prediction with real signals
      setPrediction({
        ...data,
        signals,
        generatedAt: Date.now(),
      });
    } catch (error) {
      console.warn('Error refreshing prediction:', error);
      // Fall back to simulated data
      const data = generatePrediction();
      setPrediction(data);
      setUsingRealData(false);
    } finally {
      setSignalsLoading(false);
    }
  }, []);

  // Initial load and periodic refresh (every 5 minutes)
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { prediction, isLive, setIsLive, refresh, signalsLoading, usingRealData };
}
