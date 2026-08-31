import { useI18n } from '@/contexts/I18nContext';
import { useRef, type KeyboardEvent } from 'react';

interface ProbabilityDisplayProps {
  /** Probability 0-100 for the selected horizon. */
  pct: number;
  /** Planning likelihood for the next 24 hours (0-100). */
  pct24: number;
  /** Planning likelihood for the next 48 hours (0-100). */
  pct48: number;
  /** Underlying history-only value when a current official target raises the planning likelihood. */
  modelPct?: number;
  timeframe: 24 | 48;
  onTimeframeChange: (tf: 24 | 48) => void;
  officialSchedule?: {
    window: 'within' | 'after' | 'pending' | 'grace' | 'elapsed';
    targetLabel: string | null;
    countdownLabel: string | null;
  };
}

const BAR_WIDTH = 30;

/**
 * The calibrated probability remains visible at all times. A direct official
 * schedule is displayed as a separate strong input so it informs the answer
 * without being silently converted into an uncalibrated percentage. Both the
 * 24h and 48h windows stay on screen so the selected horizon is a comparison,
 * not a hidden toggle.
 */
export function ProbabilityDisplay({ pct, pct24, pct48, modelPct, timeframe, onTimeframeChange, officialSchedule }: ProbabilityDisplayProps) {
  const { t } = useI18n();
  const tabRefs = useRef<Partial<Record<24 | 48, HTMLButtonElement>>>({});

  const moveTimeframe = (event: KeyboardEvent<HTMLButtonElement>, current: 24 | 48) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = current === 24 ? 48 : 24;
    onTimeframeChange(next);
    tabRefs.current[next]?.focus();
  };

  const filled = Math.round((pct / 100) * BAR_WIDTH);
  const barFilled = '█'.repeat(filled);
  const barEmpty = '░'.repeat(BAR_WIDTH - filled);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground/70 uppercase tracking-widest">
          {t(modelPct !== undefined ? 'hero.compositeWithinHours' : officialSchedule ? 'hero.modelWithinHours' : 'hero.horizonLabel', { n: timeframe })}
        </span>
        {/* Timeframe toggle — both windows carry their numbers */}
        <div className="flex items-center rounded-sm border border-border/50 bg-background/50 p-0.5 font-mono text-sm" role="tablist" aria-label={t('hero.horizonToggle')}>
          {([24, 48] as const).map((tf) => (
            <button
              key={tf}
              role="tab"
              id={`timeframe-tab-${tf}`}
              aria-controls="probability-forecast-panel"
              aria-selected={timeframe === tf}
              tabIndex={timeframe === tf ? 0 : -1}
              ref={(element) => { tabRefs.current[tf] = element ?? undefined; }}
              onClick={() => onTimeframeChange(tf)}
              onKeyDown={(event) => moveTimeframe(event, tf)}
              className={`inline-flex min-h-11 items-center rounded-[3px] px-2 py-0.5 transition-[color,background-color,transform] active:translate-y-px ${
                timeframe === tf
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground/40 hover:text-muted-foreground'
              }`}
            >
              [{tf}h {tf === 24 ? pct24 : pct48}%]
            </button>
          ))}
        </div>
      </div>

      <div id="probability-forecast-panel" role="tabpanel" aria-labelledby={`timeframe-tab-${timeframe}`} className="mt-3">
        <div className="flex items-baseline">
          <span className="font-mono text-8xl sm:text-9xl font-semibold leading-none tracking-tighter text-primary">
            {pct}
          </span>
          <span className="font-mono text-4xl sm:text-5xl text-primary/40">%</span>
        </div>

        <p className="mt-5 font-mono text-sm leading-none select-none" aria-hidden="true">
          <span className="text-primary">{barFilled}</span>
          <span className="text-muted-foreground/15">{barEmpty}</span>
        </p>
        <p className="mt-3 font-mono text-sm text-muted-foreground">
          <span className={timeframe === 24 ? 'text-foreground' : 'text-muted-foreground/60'}>
            {t('hero.windowStat', { pct: pct24, n: 24 })}
          </span>
          <span className="mx-2 text-border">·</span>
          <span className={timeframe === 48 ? 'text-foreground' : 'text-muted-foreground/60'}>
            {t('hero.windowStat', { pct: pct48, n: 48 })}
          </span>
          {modelPct !== undefined && <span className="text-muted-foreground/60"> · {t('hero.modelBaseline', { n: modelPct })}</span>}
        </p>

        {officialSchedule && (
          <p className="mt-5 border-l border-primary/60 pl-3 font-mono text-sm text-muted-foreground">
            <span className="text-primary">{t('hero.scheduleLabel')}</span>
            {officialSchedule.targetLabel
              ? <span> · {t('hero.scheduleTargetShort', { time: officialSchedule.targetLabel })}</span>
              : t('hero.schedulePending')}
            {officialSchedule.countdownLabel ? (
              <span className="text-muted-foreground/60"> · {officialSchedule.countdownLabel}</span>
            ) : officialSchedule.window !== 'pending' && (
              <span className="text-muted-foreground/60"> · {t(
                officialSchedule.window === 'within'
                  ? 'hero.scheduleWithin'
                  : officialSchedule.window === 'after'
                    ? 'hero.scheduleAfter'
                    : officialSchedule.window === 'grace'
                      ? 'hero.scheduleGrace'
                    : 'hero.scheduleElapsed',
                { n: timeframe },
              )}</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

export default ProbabilityDisplay;
