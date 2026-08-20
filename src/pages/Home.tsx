import { usePrediction } from "@/hooks/usePrediction";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StatusHeader } from "@/sections/StatusHeader";
import { HeroSection } from "@/sections/HeroSection";
import { ProbabilityCurve } from "@/sections/ProbabilityCurve";
import { SignalPanel } from "@/sections/SignalPanel";
import { ResetAlertsPanel } from "@/sections/ResetAlertsPanel";
import { UsageTracker } from "@/sections/UsageTracker";
import { HistoryBankedPanel } from "@/sections/HistoryBankedPanel";
import { TimeDistribution } from "@/sections/TimeDistribution";
import { ResetCalendar } from "@/sections/ResetCalendar";
import { AnchorNav } from "@/components/AnchorNav";
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

        <main className="mx-auto max-w-3xl px-4 md:px-6 py-10" role="main" aria-label="Codex Reset Prediction Dashboard">
          {/* The answer + quick nav */}
          <HeroSection prediction={prediction} />
          <AnchorNav />

          <hr className="my-10 border-border/30" />

          <div id="curve" className="scroll-mt-16">
            <ProbabilityCurve curve={prediction.curve} />
          </div>

          <hr className="my-10 border-border/30" />

          <div id="signals" className="scroll-mt-16">
            <SignalPanel prediction={prediction} loading={signalsLoading} />
          </div>

          <hr className="my-10 border-border/30" />

          <div id="usage" className="scroll-mt-16">
            <UsageTracker />
          </div>

          <hr className="my-10 border-border/30" />

          <div id="rhythm" className="scroll-mt-16">
            <TimeDistribution />
          </div>

          <hr className="my-10 border-border/30" />

          <div id="history" className="scroll-mt-16">
            <HistoryBankedPanel />
          </div>

          <hr className="my-10 border-border/30" />

          <div id="calendar" className="scroll-mt-16">
            <ResetCalendar />
          </div>

          <hr className="my-10 border-border/30" />

          <div id="alerts" className="scroll-mt-16">
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
    </TooltipProvider>
  );
}
