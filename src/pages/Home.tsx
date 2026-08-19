import { usePrediction } from "@/hooks/usePrediction";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StatusHeader } from "@/sections/StatusHeader";
import { ResetEstimatePanel } from "@/sections/CountdownPanel";
import { ProbabilityCurve } from "@/sections/ProbabilityCurve";
import { SignalPanel } from "@/sections/SignalPanel";
import { HistoryPanel } from "@/sections/HistoryPanel";
import { ModelInfo } from "@/sections/ModelInfo";
import { SubscribePanel } from "@/sections/SubscribePanel";
import { UsageTracker } from "@/sections/UsageTracker";
import { BankedResets } from "@/sections/BankedResets";
import { TimeDistribution } from "@/sections/TimeDistribution";
import { ResetCalendar } from "@/sections/ResetCalendar";
import { PredictionAccuracy } from "@/sections/PredictionAccuracy";
import { sharePredictionState, copyToClipboard, exportPersonalData } from "@/lib/export-share";
import { useI18n } from "@/contexts/I18nContext";

export default function Home() {
  const { prediction, isLive, signalsLoading, usingRealData } = usePrediction();
  const { t } = useI18n();

  if (!prediction) {
    return (
      <div className="flex h-screen items-center justify-center" role="status" aria-label="Loading">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
          <span className="text-sm font-mono">{t('common.loading')}</span>
        </div>
      </div>
    );
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
    <TooltipProvider>
      <div className="min-h-screen bg-background p-3 sm:p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <StatusHeader
            prediction={prediction}
            isLive={isLive}
            onRefresh={() => window.location.reload()}
            onShare={handleShare}
            onExport={() => {
              const usage = JSON.parse(localStorage.getItem('codex-usage-tracker') || '{}');
              const resets = JSON.parse(localStorage.getItem('codex-banked-resets') || '[]');
              exportPersonalData(usage, resets);
            }}
          />

          {/* Main grid - responsive: 1 column on mobile, 12 columns on desktop */}
          <main className="mt-4 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-12" role="main" aria-label="Codex Reset Prediction Dashboard">
            {/* Left column - Primary data */}
            <section className="md:col-span-8 space-y-3 sm:space-y-4" aria-label="Primary prediction data">
              {/* Reset estimate panel (probability-first, no countdown) */}
              <ResetEstimatePanel prediction={prediction} />

              {/* Probability curve */}
              <ProbabilityCurve curve={prediction.curve} />

              {/* Signal radar */}
              <SignalPanel prediction={prediction} loading={signalsLoading} />

              {/* Reset time distribution */}
              <TimeDistribution />
            </section>

            {/* Right column - Secondary data */}
            <aside className="md:col-span-4 space-y-3 sm:space-y-4" aria-label="Additional tools and history">
              <SubscribePanel />
              <UsageTracker />
              <BankedResets />
              <ResetCalendar />
              <PredictionAccuracy />
              <HistoryPanel />
              <ModelInfo />
            </aside>
          </main>

          {/* Footer */}
          <footer className="mt-6 border-t border-border/30 pt-4 text-center text-xs text-muted-foreground" role="contentinfo">
            <p>{t('footer.disclaimer')}</p>
            <p className="mt-1">
              {usingRealData ? t('footer.liveData') : t('footer.simulatedData')}
            </p>
          </footer>
        </div>
      </div>
    </TooltipProvider>
  );
}
