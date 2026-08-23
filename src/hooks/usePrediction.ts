import { useState, useEffect, useCallback } from "react";
import { generatePrediction } from "@/lib/prediction";
import { getDashboardInputs } from "@/lib/signal-fetcher";
import type { ResetPrediction, ResetRecord } from "@/types/reset";

/**
 * Hook that manages the reset prediction state.
 * Fetches real signals from public sources (Tibo tweets, OpenAI status page)
 * and reset history from Supabase.
 * Falls back to the bundled, local model if live inputs are unavailable.
 * Refreshes data every 5 minutes; an explicit user refresh bypasses the
 * short in-memory snapshot cache so it always asks the Worker for its latest
 * already-generated result.
 */
export function usePrediction() {
  // Wait for the first refresh rather than showing a bundled estimate that
  // could disagree with current verified history for one visible frame.
  const [prediction, setPrediction] = useState<ResetPrediction | null>(null);
  const [resetRecords, setResetRecords] = useState<ResetRecord[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [usingRealData, setUsingRealData] = useState(false);
  // Honest badge: LIVE only when a fresh Worker signal snapshot was received.
  const isLive = usingRealData;

  const refresh = useCallback(async (force = false) => {
    setSignalsLoading(true);
    
    try {
      const { signals, hasRealData, records: snapshotRecords } = await getDashboardInputs(generatePrediction().signals, force);
      // The Worker supplies real verified history with a fresh snapshot. If
      // it is unavailable, use the local baseline immediately rather than
      // opening a second cross-origin database request on the visitor path.
      const records = snapshotRecords ?? [];
      setResetRecords(records);
      setUsingRealData(hasRealData);

      // Signals remain informational; probabilities are derived from the
      // forward-looking reset history only.
      setPrediction(generatePrediction(records, signals));
    } catch (error) {
      console.warn('Error refreshing prediction:', error);
      // Fall back to simulated data — timestamp it honestly so the header's
      // "updated Xm ago" reflects this refresh, not a stale generation time.
      const data = generatePrediction();
      setPrediction({ ...data, generatedAt: Date.now() });
      setUsingRealData(false);
    } finally {
      setSignalsLoading(false);
    }
  }, []);

  // Initial load and periodic refresh (every 5 minutes)
  useEffect(() => {
    // Run after mount so the skeleton is the only pre-refresh state.
    const initialRefresh = window.setTimeout(() => {
      void refresh();
    }, 0);
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => {
      window.clearTimeout(initialRefresh);
      clearInterval(interval);
    };
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
