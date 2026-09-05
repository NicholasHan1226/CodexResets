import { useState, useEffect, useCallback, useRef } from "react";
import { generatePrediction } from "@/lib/prediction";
import { getDashboardInputs } from "@/lib/signal-fetcher";
import type { ResetPrediction } from "@/types/reset";

type PredictionState =
  | { status: 'loading' | 'unavailable'; prediction: null }
  | { status: 'ready' | 'refreshing'; prediction: ResetPrediction };

/** Fresh Worker inputs only. Manual refresh bypasses the five-minute cache. */
export function usePrediction() {
  const [state, setState] = useState<PredictionState>({ status: 'loading', prediction: null });
  const latestRefreshId = useRef(0);

  const refresh = useCallback(async (force = false) => {
    const id = ++latestRefreshId.current;
    setState((previous) => previous.prediction
      ? { status: 'refreshing', prediction: previous.prediction }
      : { status: 'loading', prediction: null });
    try {
      const { signals, hasRealData, generatedAt, records, bankedNotices } = await getDashboardInputs(force);
      if (id !== latestRefreshId.current) return;
      if (!hasRealData || !signals || !records?.length || generatedAt === null) {
        setState({ status: 'unavailable', prediction: null });
        return;
      }
      // Preserve the server's input timestamp; a browser refresh is not new evidence.
      setState({ status: 'ready', prediction: { ...generatePrediction(records, signals), generatedAt, bankedNotices } });
    } catch {
      if (id === latestRefreshId.current) setState({ status: 'unavailable', prediction: null });
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const interval = window.setInterval(() => { void refresh(); }, 5 * 60 * 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      // Late results cannot update an unmounted dashboard or a subsequent mount.
      latestRefreshId.current += 1;
    };
  }, [refresh]);

  return { state, refresh };
}
