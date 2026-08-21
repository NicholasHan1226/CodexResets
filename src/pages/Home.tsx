import { useState } from "react";
import { usePrediction } from "@/hooks/usePrediction";
import { StatusHeader } from "@/sections/StatusHeader";
import { HeroSection } from "@/sections/HeroSection";
import { SignalPanel } from "@/sections/SignalPanel";
import { ResetAlertsPanel } from "@/sections/ResetAlertsPanel";
import { HistoryPanel } from "@/sections/HistoryPanel";
import { TimeDistribution } from "@/sections/TimeDistribution";
import { ResetCalendar } from "@/sections/ResetCalendar";
import { ProbabilityCurve } from "@/sections/ProbabilityCurve";
import { AnchorNav } from "@/components/AnchorNav";
import { buildShareSummary, shareUrl, copyToClipboard } from "@/lib/export-share";
import { useI18n } from "@/contexts/I18nContext";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";

export default function Home() {
  const { prediction, isLive, signalsLoading, usingRealData, refresh } = usePrediction();
  const { t } = useI18n();
  const [timeframe, setTimeframe] = useState<24 | 48>(24);

  if (!prediction) {
    return <DashboardSkeleton />;
  }

  const handleShare = async () => {
    const pct = Math.round((timeframe === 24 ? prediction.prob24h : prediction.prob48h) * 100);
    const text = buildShareSummary({
      pct,
      hours: timeframe,
      daysSince: prediction.daysSinceLastReset,
      medianDays: prediction.medianIntervalDays,
    });
    await copyToClipboard(`${text}\n${shareUrl()}`);
  };

  return (
      <div className="min-h-screen bg-background">
        <StatusHeader
          prediction={prediction}
          isLive={isLive}
          onRefresh={() => { void refresh(); }}
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
            <ProbabilityCurve curve={prediction.curve} hours={timeframe} />
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
            <ResetAlertsPanel prob24h={prediction.prob24h} />
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
