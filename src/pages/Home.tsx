import { useEffect, useState } from "react";
import { usePrediction } from "@/hooks/usePrediction";
import { StatusHeader } from "@/sections/StatusHeader";
import { HeroSection } from "@/sections/HeroSection";
import { SignalPanel } from "@/sections/SignalPanel";
import { ResetAlertsPanel } from "@/sections/ResetAlertsPanel";
import { HistoryPanel } from "@/sections/HistoryPanel";
import { TimeDistribution } from "@/sections/TimeDistribution";
import { ResetCalendar } from "@/sections/ResetCalendar";
import { GuideLinks } from "@/components/GuideLinks";
import { useI18n } from "@/contexts/I18nContext";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { DashboardUnavailable } from "@/components/DashboardUnavailable";
import { isFreshPipelineSnapshot } from "@/lib/signal-fetcher";
import { shouldShowResetCalendar } from "@/lib/reset-data";
import { getPrimaryForecast } from "@/lib/forecast-display";

export default function Home() {
  const { state, refresh } = usePrediction();
  const { prediction } = state;
  const { t } = useI18n();
  const [timeframe, setTimeframe] = useState<24 | 48>(24);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  if (prediction && !isFreshPipelineSnapshot(prediction.generatedAt, now)) {
    return <DashboardUnavailable onRetry={() => { void refresh(true); }} />;
  }

  if (!prediction) {
    if (state.status === 'unavailable') {
      return <DashboardUnavailable onRetry={() => { void refresh(true); }} />;
    }
    return <DashboardSkeleton />;
  }

  const showCalendar = shouldShowResetCalendar();
  const primaryForecast = getPrimaryForecast(prediction.signals, timeframe, now);
  const showHistoricalTiming = primaryForecast.kind !== 'official-schedule';

  return (
      <div id="top" className="min-h-screen bg-background">
        <StatusHeader
          prediction={prediction}
          timeframe={timeframe}
          primaryForecast={primaryForecast}
          currentTime={now}
          isRefreshing={state.status === 'refreshing'}
          onRefresh={() => { void refresh(true); }}
        />

        <main className="mx-auto max-w-4xl px-4 py-8 md:px-6 lg:py-10" role="main" aria-label="Codex Reset Prediction Dashboard">
          {/* Answer first, then the subscribe well — deeper evidence follows. */}
          <HeroSection
            prediction={prediction}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            primaryForecast={primaryForecast}
            currentTime={now}
          />

          <hr className="my-8 border-border/30" />

          <div id="alerts" className="scroll-mt-24">
            <ResetAlertsPanel />
          </div>

          <hr className="my-8 border-border/30" />

          <details className="group">
            <summary className="cursor-pointer py-3 font-mono text-sm text-foreground marker:text-primary">
              {t('home.evidence')}
              <span className="mt-1 block text-xs font-sans text-muted-foreground">{t('home.evidenceHint')}</span>
            </summary>
            <div className="pt-6">
              <div id="signals" className="scroll-mt-16 cv-auto">
                <SignalPanel prediction={prediction} loading={state.status === 'refreshing'} />
              </div>

              {showHistoricalTiming && <>
                <hr className="my-8 border-border/30" />

                <div id="rhythm" className="scroll-mt-16 cv-auto">
                  <TimeDistribution />
                </div>
              </>}

              <hr className="my-8 border-border/30" />

              <div id="history" className="scroll-mt-16 cv-auto">
                <HistoryPanel />
              </div>

              {showCalendar && <>
                <hr className="my-8 border-border/30" />

                <div id="calendar" className="scroll-mt-16 cv-auto">
                  <ResetCalendar />
                </div>
              </>}

            </div>
          </details>

          {/* Footer */}
          <footer className="mt-10 pt-6 border-t border-border/30" role="contentinfo">
            <p className="text-xs text-muted-foreground">{t('footer.disclaimer')}</p>
            <GuideLinks className="mt-3 font-mono text-xs" />
          </footer>
        </main>
      </div>
  );
}
