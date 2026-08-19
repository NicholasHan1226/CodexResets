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
import { sharePredictionState, copyToClipboard } from "@/lib/export-share";
import { Share2, Check } from "lucide-react";
import { useState } from "react";

export default function Home() {
  const { prediction, isLive, signalsLoading, usingRealData } = usePrediction();
  const [copied, setCopied] = useState(false);

  if (!prediction) {
    return (
      <div className="flex h-screen items-center justify-center" role="status" aria-label="Loading">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
          <span className="text-sm font-mono">Initializing signal model...</span>
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
    const success = await copyToClipboard(url);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background p-3 sm:p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <StatusHeader
            isLive={isLive}
            modelVersion={prediction.modelVersion}
            usingRealData={usingRealData}
            signalsLoading={signalsLoading}
          />

          {/* Share button */}
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 rounded-md border border-border/50 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              aria-label="Share prediction state"
            >
              {copied ? <Check className="h-3 w-3" /> : <Share2 className="h-3 w-3" />}
              {copied ? "Copied!" : "Share"}
            </button>
          </div>

          {/* Main grid - responsive: 1 column on mobile, 12 columns on desktop */}
          <main className="mt-4 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-12" role="main" aria-label="Codex Reset Prediction Dashboard">
            {/* Left column - Primary data */}
            <section className="md:col-span-8 space-y-3 sm:space-y-4" aria-label="Primary prediction data">
              {/* Reset estimate panel (probability-first, no countdown) */}
              <ResetEstimatePanel
                prob24h={prediction.prob24h}
                prob48h={prediction.prob48h}
                daysSinceLastReset={prediction.daysSinceLastReset}
                medianIntervalDays={prediction.medianIntervalDays}
                advice={prediction.advice}
                confidence={prediction.confidence}
              />

              {/* Probability curve */}
              <ProbabilityCurve curve={prediction.curve} />

              {/* Signal radar */}
              <SignalPanel signals={prediction.signals} loading={signalsLoading} />

              {/* Reset time distribution */}
              <TimeDistribution />
            </section>

            {/* Right column - Secondary data */}
            <aside className="md:col-span-4 space-y-3 sm:space-y-4" aria-label="Additional tools and history">
              <SubscribePanel />
              <UsageTracker />
              <BankedResets />
              <HistoryPanel />
              <ModelInfo />
            </aside>
          </main>

          {/* Footer */}
          <footer className="mt-6 sm:mt-8 border-t border-border/50 pt-4" role="contentinfo">
            <div className="flex flex-col gap-1 text-[10px] text-muted-foreground/60 sm:flex-row sm:items-center sm:justify-between">
              <span>Codex Resets Prediction Model {prediction.modelVersion}</span>
              <span className="max-w-md">Resets are manually triggered by OpenAI and cannot be precisely predicted. This is a probability estimate based on historical patterns and public signals.</span>
              <span>Not affiliated with OpenAI</span>
            </div>
          </footer>
        </div>
      </div>
    </TooltipProvider>
  );
}
