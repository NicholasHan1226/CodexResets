import { useI18n } from '@/contexts/I18nContext';

interface ProbabilityDisplayProps {
  /** Probability 0-100 */
  pct: number;
  timeframe: 24 | 48;
  onTimeframeChange: (tf: 24 | 48) => void;
}

const BAR_WIDTH = 30;

/**
 * The single protagonist of the page: giant probability number
 * + ASCII bar + 24h/48h toggle.
 */
export function ProbabilityDisplay({ pct, timeframe, onTimeframeChange }: ProbabilityDisplayProps) {
  const { t } = useI18n();

  const filled = Math.round((pct / 100) * BAR_WIDTH);
  const barFilled = '█'.repeat(filled);
  const barEmpty = '░'.repeat(BAR_WIDTH - filled);

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground/70 uppercase tracking-widest">
          {t('hero.probLabel')}
        </span>
        {/* Timeframe toggle */}
        <div className="flex items-center font-mono text-sm" role="tablist" aria-label="Timeframe">
          {([24, 48] as const).map((tf) => (
            <button
              key={tf}
              role="tab"
              aria-selected={timeframe === tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-2 py-0.5 transition-colors ${
                timeframe === tf
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground/40 hover:text-muted-foreground'
              }`}
            >
              [{tf}h]
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-baseline">
        <span className="font-mono text-8xl sm:text-9xl font-semibold leading-none tracking-tighter text-primary">
          {pct}
        </span>
        <span className="font-mono text-4xl sm:text-5xl text-primary/40">%</span>
      </div>

      {/* ASCII probability bar */}
      <p className="mt-5 font-mono text-sm leading-none select-none" aria-hidden="true">
        <span className="text-primary">{barFilled}</span>
        <span className="text-muted-foreground/15">{barEmpty}</span>
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        {t('hero.withinHours', { n: timeframe })}
      </p>
    </div>
  );
}

export default ProbabilityDisplay;
