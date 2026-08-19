import { usePrediction } from "@/hooks/usePrediction";
import { getHistoricalResets } from "@/lib/prediction";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StatusHeader } from "@/sections/StatusHeader";
import { CountdownPanel } from "@/sections/CountdownPanel";
import { ProbabilityGauges } from "@/sections/ProbabilityGauges";
import { ProbabilityCurve } from "@/sections/ProbabilityCurve";
import { SignalPanel } from "@/sections/SignalPanel";
import { HistoryPanel } from "@/sections/HistoryPanel";
import { ModelInfo } from "@/sections/ModelInfo";
import { SubscribePanel } from "@/sections/SubscribePanel";

export default function Home() {
  const { prediction, countdown, isLive, setIsLive } = usePrediction();
  const historicalResets = getHistoricalResets();

  if (!prediction) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span className="text-sm font-mono">Initializing signal model...</span>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <StatusHeader
            isLive={isLive}
            onToggleLive={setIsLive}
            modelVersion={prediction.modelVersion}
            generatedAt={prediction.generatedAt}
          />

          {/* Main grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            {/* Left column - Primary data */}
            <div className="md:col-span-8 space-y-4">
              {/* Top row: Countdown + Probability gauges */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <CountdownPanel
                    countdown={countdown}
                    windowStart={prediction.windowStart}
                    windowEnd={prediction.windowEnd}
                    confidence={prediction.confidence}
                  />
                </div>
                <div className="sm:col-span-2">
                  <ProbabilityGauges
                    prob24h={prediction.prob24h}
                    prob48h={prediction.prob48h}
                  />
                </div>
              </div>

              {/* Probability curve */}
              <ProbabilityCurve curve={prediction.curve} />

              {/* Signal monitor */}
              <SignalPanel signals={prediction.signals} />
            </div>

            {/* Right column - Secondary data */}
            <div className="md:col-span-4 space-y-4">
              <SubscribePanel />
              <HistoryPanel resets={historicalResets} />
              <ModelInfo />
            </div>
          </div>

          {/* Footer */}
          <footer className="mt-8 border-t border-border/50 pt-4">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
              <span>Codex Resets Prediction Model {prediction.modelVersion}</span>
              <span>Not affiliated with OpenAI</span>
            </div>
          </footer>
        </div>
      </div>
    </TooltipProvider>
  );
}
