import { useState, lazy, Suspense } from "react";
import { usePrediction } from "@/hooks/usePrediction";
import { StatusHeader } from "@/sections/StatusHeader";
import { HeroSection } from "@/sections/HeroSection";
import { SignalPanel } from "@/sections/SignalPanel";
import { ResetAlertsPanel } from "@/sections/ResetAlertsPanel";
import { HistoryPanel } from "@/sections/HistoryPanel";
import { TimeDistribution } from "@/sections/TimeDistribution";
import { ResetCalendar } from "@/sections/ResetCalendar";
import { AnchorNav } from "@/components/AnchorNav";
import { sharePredictionState, copyToClipboard } from "@/lib/export-share";
import { useI18n } from "@/contexts/I18nContext";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";

// Recharts (~108KB gzip) is only used here and sits below the fold —
// lazy-load it so first paint doesn't pay for the charting library.
const ProbabilityCurve = lazy(() =>
  import("@/sections/ProbabilityCurve").then((m) => ({ default: m.ProbabilityCurve }))
);

export default function Home() {
  const { prediction, isLive, signalsLoading, usingRealData } = usePrediction();
  const { t } = useI18n();
  const [timeframe, setTimeframe] = useState<24 | 48>(24);

  if (!prediction) {
    return <DashboardSkeleton />;
  }

  const handleShare = async () => {
    const url = sharePredictionState({
      probability24h: prediction.prob24h,
      probability48h: prediction.prob48h,
      daysSinceLastReset: prediction.daysSinceLastReset,
      medianInterval: prediction.medianIntervalDays,
    });
    await copyToClipboard(url);
  };

  return (
      <div className="min-h-screen bg-background">
        <StatusHeader
          prediction={prediction}
          isLive={isLive}
          onRefresh={() => window.location.reload()}
          onShare={handleShare}
        />

        <main className="mx-auto max-w-3xl px-4 md:px-6 py-10" role="main" aria-label="Codex Reset Prediction Dashboard">
          {/* The probability + quick nav */}
          <HeroSection
            prediction={prediction}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
          />
          <AnchorNav />

          <hr className="my-10 border-border/30" />

          <div id="curve" className="scroll-mt-16">
            <Suspense fallback={<div className="h-40 sm:h-56 w-full animate-pulse rounded bg-muted/30" aria-hidden="true" />}>
              <ProbabilityCurve curve={prediction.curve} hours={timeframe} />
            </Suspense>
          </div>

          <hr className="my-10 border-border/30" />

          <div id="signals" className="scroll-mt-16 cv-auto">
            <SignalPanel prediction={prediction} loading={signalsLoading} />
          </div>

          <hr className="my-10 border-border/30" />

          <div id="rhythm" className="scroll-mt-16 cv-auto">
            <TimeDistribution />
          </div>

          <hr className="my-10 border-border/30" />

          <div id="history" className="scroll-mt-16 cv-auto">
            <HistoryPanel />
          </div>

          <hr className="my-10 border-border/30" />

          <div id="calendar" className="scroll-mt-16 cv-auto">
            <ResetCalendar />
          </div>

          <hr className="my-10 border-border/30" />

          <div id="alerts" className="scroll-mt-16 cv-auto">
            <ResetAlertsPanel />
          </div>

          {/* Footer */}
          <footer className="mt-10 pt-6 border-t border-border/30" role="contentinfo">
            <p className="text-xs text-muted-foreground">{t('footer.disclaimer')}</p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground/50">
              {usingRealData ? t('footer.liveData') : t('footer.simulatedData')}
            </p>
          </footer>
        </main>
      </div>
  );
}
