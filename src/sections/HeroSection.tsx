import { useI18n } from '@/contexts/I18nContext';
import type { ResetPrediction } from '@/types/reset';

interface HeroSectionProps {
  prediction: ResetPrediction;
}

export function HeroSection({ prediction }: HeroSectionProps) {
  const { t, locale } = useI18n();
  const pct24 = Math.round(prediction.prob24h * 100);
  const pct48 = Math.round(prediction.prob48h * 100);

  const lastResetDate = prediction.lastReset ? new Date(prediction.lastReset) : null;
  const daysSince = prediction.daysSinceLastReset;

  // The answer: high prob = likely, low = no
  const isLikely = pct24 >= 50;

  const lastResetStr = lastResetDate
    ? lastResetDate.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'short',
        day: 'numeric',
      }) +
      ', ' +
      lastResetDate.toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '—';

  return (
    <section aria-label="Reset answer" className="max-w-3xl">
      {/* Terminal prompt */}
      <p className="font-mono text-sm text-muted-foreground">
        <span className="text-primary">❯</span> will codex reset?{' '}
        <span className="text-muted-foreground/60">
          {isLikely ? t('hero.signalYes') : t('hero.signalNo')}
        </span>
      </p>

      {/* The answer */}
      <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-foreground">
        {isLikely ? t('hero.answerYes') : t('hero.answerNo')}
      </h1>

      {/* Context line */}
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {t('hero.lastResetWas')}{' '}
        <span className="font-mono text-foreground">
          {daysSince.toFixed(1)} {t('hero.daysAgo')}
        </span>{' '}
        ({lastResetStr}).{' '}
        {t('hero.flatNote')}
      </p>

      {/* Inline stats */}
      <p className="mt-5 font-mono text-sm text-foreground">
        <span className="text-primary font-semibold">{pct24}%</span>{' '}
        <span className="text-muted-foreground">in 24h</span>
        <span className="mx-2 text-border">·</span>
        <span className="text-foreground font-semibold">{pct48}%</span>{' '}
        <span className="text-muted-foreground">in 48h</span>
        <span className="mx-2 text-border">·</span>
        <span className="text-muted-foreground">{t('hero.medianGap')}</span>{' '}
        <span className="text-foreground">{prediction.medianIntervalDays.toFixed(1)}d</span>
      </p>

      {/* Advice — plain text, no box */}
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        <span className="text-foreground font-medium">{t('hero.adviceLabel')}</span>{' '}
        {prediction.advice.text}
      </p>
    </section>
  );
}

export default HeroSection;
