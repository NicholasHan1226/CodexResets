import { usePrediction } from "@/hooks/usePrediction";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StatusHeader } from "@/sections/StatusHeader";
import { HeroSection } from "@/sections/HeroSection";
import { ProbabilityCurve } from "@/sections/ProbabilityCurve";
import { SignalPanel } from "@/sections/SignalPanel";
import { ModelInfo } from "@/sections/ModelInfo";
import { ResetAlertsPanel } from "@/sections/ResetAlertsPanel";
import { UsageTracker } from "@/sections/UsageTracker";
import { HistoryBankedPanel } from "@/sections/HistoryBankedPanel";
import { TimeDistribution } from "@/sections/TimeDistribution";
import { ResetCalendar } from "@/sections/ResetCalendar";
import { PredictionAccuracy } from "@/sections/PredictionAccuracy";
import { sharePredictionState, copyToClipboard, exportPersonalData } from "@/lib/export-share";
import { useI18n } from "@/contexts/I18nContext";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";

export default function Home() {
  const { prediction, isLive, signalsLoading, usingRealData } = usePrediction();
  const { t } = useI18n();

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
    <TooltipProvider>
      <div className="min-h-screen bg-background">
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

        <main className="mx-auto max-w-7xl px-4 md:px-6 py-8" role="main" aria-label="Codex Reset Prediction Dashboard">
          {/* Hero Section - full width */}
          <HeroSection prediction={prediction} />

          {/* Main grid: 8+4 columns */}
          <div className="grid grid-cols-12 gap-6 mt-8">
            {/* Left column - Primary data */}
            <section className="col-span-12 lg:col-span-8 flex flex-col gap-6 min-w-0" aria-label="Primary prediction data">
              <div className="fade-in-up-delay-1">
                <ProbabilityCurve curve={prediction.curve} />
              </div>

              <div className="fade-in-up-delay-2">
                <SignalPanel prediction={prediction} loading={signalsLoading} />
              </div>

              <div className="fade-in-up-delay-3">
                <TimeDistribution />
              </div>
            </section>

            {/* Right column - Secondary data */}
            <aside className="col-span-12 lg:col-span-4 flex flex-col gap-6 min-w-0" aria-label="Tools and history">
              <div className="fade-in-up-delay-1">
                <ResetAlertsPanel />
              </div>
              <div className="fade-in-up-delay-2">
                <UsageTracker />
              </div>
              <div className="fade-in-up-delay-3">
                <HistoryBankedPanel />
              </div>
              <div className="fade-in-up-delay-3">
                <ResetCalendar />
              </div>
              <div className="fade-in-up-delay-3">
                <PredictionAccuracy />
              </div>
              <div className="fade-in-up-delay-3">
                <ModelInfo />
              </div>
            </aside>
          </div>

          {/* Footer */}
          <footer className="mt-8 pt-6 border-t border-border/10 text-center" role="contentinfo">
            <p className="text-xs text-muted-foreground">{t('footer.disclaimer')}</p>
            <p className="mt-1 text-[11px] text-muted-foreground/60 font-mono">
              {usingRealData ? t('footer.liveData') : t('footer.simulatedData')}
            </p>
          </footer>
        </main>
      </div>
    </TooltipProvider>
  );
}
