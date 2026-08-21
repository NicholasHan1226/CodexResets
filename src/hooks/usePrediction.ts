import { useState, useEffect, useCallback } from "react";
import { generatePrediction } from "@/lib/prediction";
import { getSignalsWithFallback } from "@/lib/signal-fetcher";
import { fetchResetRecords } from "@/lib/reset-records";
import type { ResetPrediction, ResetRecord } from "@/types/reset";

/**
 * Hook that manages the reset prediction state.
 * Fetches real signals from public sources (Tibo tweets, OpenAI status page)
 * and reset history from Supabase.
 * Falls back to simulated data if real fetch fails.
 * Refreshes data every 5 minutes (signals are cached).
 */
export function usePrediction() {
  // Render instantly from local historical data — network data enhances it async.
  // This keeps LCP off the Supabase roundtrip critical path.
  const [prediction, setPrediction] = useState<ResetPrediction | null>(() => {
    const data = generatePrediction();
    return { ...data, generatedAt: Date.now() };
  });
  const [resetRecords, setResetRecords] = useState<ResetRecord[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [usingRealData, setUsingRealData] = useState(false);
  // Honest badge: LIVE only when real signals/records actually flowed in,
  // SIM when we're showing the bundled fallback model.
  const isLive = usingRealData;

  const refresh = useCallback(async () => {
    setSignalsLoading(true);
    
    try {
      // Records (Supabase) and signals (RSS/status page) are independent
      // network calls — run them in parallel to halve the refresh latency.
      const recordsPromise = fetchResetRecords();
      const signalsPromise = getSignalsWithFallback(generatePrediction().signals);

      const records = await recordsPromise;
      if (records.length > 0) {
        setResetRecords(records);
      }

      // Generate base prediction from historical data
      const data = generatePrediction(records.length > 0 ? records : undefined);

      const { signals, hasRealData } = await signalsPromise;
      setUsingRealData(hasRealData || records.length > 0);

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

  return {
    prediction,
    resetRecords,
    isLive,
    signalsLoading,
    usingRealData,
    refresh,
  };
}
