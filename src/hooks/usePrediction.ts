import { useState, useEffect, useCallback, useRef } from "react";
import { generatePrediction } from "@/lib/prediction";
import { getDashboardInputs } from "@/lib/signal-fetcher";
import type { ResetPrediction, ResetRecord } from "@/types/reset";

/**
 * Hook that manages the reset prediction state.
 * Fetches the Worker-produced signals and verified reset history together.
 * It never renders a locally simulated forecast when the live inputs fail.
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
  const [dataUnavailable, setDataUnavailable] = useState(false);
  // A manual refresh may overlap the initial/periodic refresh. Only the most
  // recently started request is allowed to update the dashboard state.
  const latestRefreshId = useRef(0);
  // Honest badge: LIVE only when a fresh Worker signal snapshot was received.
  const isLive = usingRealData;

  const refresh = useCallback(async (force = false) => {
    const refreshId = ++latestRefreshId.current;
    setSignalsLoading(true);
    
    try {
      const { signals, hasRealData, generatedAt, records: snapshotRecords } = await getDashboardInputs(force);
      if (refreshId !== latestRefreshId.current) return;
      if (!hasRealData || !signals || !snapshotRecords || snapshotRecords.length === 0) {
        setPrediction(null);
        setResetRecords([]);
        setUsingRealData(false);
        setDataUnavailable(true);
        return;
      }
      const records = snapshotRecords;
      setResetRecords(records);
      setUsingRealData(hasRealData);
      setDataUnavailable(false);

      // Signals remain informational; probabilities are derived from the
      // forward-looking reset history only.
      const nextPrediction = generatePrediction(records, signals);
      // The header reports when the inputs were produced, not when this
      // browser happened to recompute the derived probability.
      setPrediction({ ...nextPrediction, generatedAt: generatedAt ?? Date.now() });
    } catch (error) {
      console.warn('Error refreshing prediction:', error);
      if (refreshId !== latestRefreshId.current) return;
      setPrediction(null);
      setResetRecords([]);
      setUsingRealData(false);
      setDataUnavailable(true);
    } finally {
      if (refreshId === latestRefreshId.current) setSignalsLoading(false);
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
    dataUnavailable,
    refresh,
  };
}
