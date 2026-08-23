import { useEffect, useState } from "react";
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
import { shouldShowResetCalendar } from "@/lib/reset-data";
import { formatOfficialScheduleTarget, getPrimaryForecast } from "@/lib/forecast-display";

export default function Home() {
  const { prediction, isLive, signalsLoading, refresh } = usePrediction();
  const { t, locale } = useI18n();
  const [timeframe, setTimeframe] = useState<24 | 48>(24);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  if (!prediction) {
    return <DashboardSkeleton />;
  }

  const showCalendar = shouldShowResetCalendar();
  const primaryForecast = getPrimaryForecast(prediction.signals, timeframe, now);
  const officialSchedule = primaryForecast.kind === 'official-schedule'
    ? {
        targetLabel: formatOfficialScheduleTarget(primaryForecast.scheduledAt, locale),
        window: primaryForecast.window,
      }
    : undefined;
  const showHistoricalTiming = !officialSchedule;

  const handleShare = async () => {
    const pct = Math.round((timeframe === 24 ? prediction.prob24h : prediction.prob48h) * 100);
    const text = buildShareSummary({
      pct,
      hours: timeframe,
      daysSince: prediction.daysSinceLastReset,
      medianDays: prediction.medianIntervalDays,
      officialSchedule,
    }, locale);
    await copyToClipboard(`${text}\n${shareUrl()}`);
  };

  return (
      <div className="min-h-screen bg-background">
        <StatusHeader
          prediction={prediction}
          isLive={isLive}
          isRefreshing={signalsLoading}
          onRefresh={() => { void refresh(true); }}
          onShare={handleShare}
        />

        <main className="mx-auto max-w-4xl px-4 py-10 md:px-6 lg:py-12" role="main" aria-label="Codex Reset Prediction Dashboard">
          {/* The probability + quick nav */}
          <div className="micro-fade-up">
            <HeroSection
              prediction={prediction}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              primaryForecast={primaryForecast}
            />
            <AnchorNav showCalendar={showCalendar} showRhythm={showHistoricalTiming} />
          </div>

          <hr className="my-10 border-border/30" />

          <div id="curve" className="scroll-mt-16">
            <ProbabilityCurve curve={prediction.curve} hours={timeframe} officialSchedule={officialSchedule} />
          </div>

          <hr className="my-10 border-border/30" />

          <div id="signals" className="scroll-mt-16 cv-auto">
            <SignalPanel prediction={prediction} loading={signalsLoading} />
          </div>

          {showHistoricalTiming && <>
            <hr className="my-10 border-border/30" />

            <div id="rhythm" className="scroll-mt-16 cv-auto">
              <TimeDistribution />
            </div>
          </>}

          <hr className="my-10 border-border/30" />

          <div id="history" className="scroll-mt-16 cv-auto">
            <HistoryPanel />
          </div>

          {showCalendar && <>
            <hr className="my-10 border-border/30" />

            <div id="calendar" className="scroll-mt-16 cv-auto">
              <ResetCalendar />
            </div>
          </>}

          <hr className="my-10 border-border/30" />

          <div id="alerts" className="scroll-mt-16 cv-auto">
            <ResetAlertsPanel />
          </div>

          {/* Footer */}
          <footer className="mt-10 pt-6 border-t border-border/30" role="contentinfo">
            <p className="text-xs text-muted-foreground">{t('footer.disclaimer')}</p>
          </footer>
        </main>
      </div>
  );
}
