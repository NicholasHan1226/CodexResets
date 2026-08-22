import { Link } from 'react-router';
import { useI18n } from '@/contexts/I18nContext';

export default function About() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background">
      {/* Header — minimal, back link */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-sm border-b border-border/20">
        <div className="max-w-3xl mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← {t('app.title')}
            </Link>
          </div>
          <span className="font-mono text-xs text-muted-foreground/60">
            {t('about.title')}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 md:px-6 py-10" role="main" aria-label="Documentation">
        {/* Page title */}
        <p className="font-mono text-sm text-muted-foreground">
          <span className="text-primary">❯</span> man codex-resets
        </p>
        <h1 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
          {t('about.heading')}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t('about.intro')}
        </p>

        {/* === How the model works === */}
        <hr className="my-10 border-border/30" />
        <section aria-label="How the model works">
          <h2 className="text-lg font-semibold text-foreground">
            <span className="mr-2 font-mono font-normal text-primary">❯</span>
            {t('model.title')}
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              <span className="text-foreground font-medium">{t('model.signalBased')}.</span>{' '}
              {t('model.signalBasedDesc')}
            </p>
            <p>
              <span className="text-foreground font-medium">{t('model.historicalData')}.</span>{' '}
              {t('model.historicalDataDesc')}
            </p>
            <p>
              <span className="text-foreground font-medium">{t('model.weibullModel')}.</span>{' '}
              {t('model.weibullModelDesc')}
            </p>
          </div>
        </section>

        {/* === How Codex limits work === */}
        <hr className="my-10 border-border/30" />
        <section aria-label="How Codex limits work">
          <h2 className="text-lg font-semibold text-foreground">
            <span className="mr-2 font-mono font-normal text-primary">❯</span>
            {t('limits.title')}
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              <span className="text-foreground font-medium">{t('limits.5hTitle')}.</span>{' '}
              {t('limits.5hDesc')}
            </p>
            <p>
              <span className="text-foreground font-medium">{t('limits.weeklyTitle')}.</span>{' '}
              {t('limits.weeklyDesc')}
            </p>
            <p>
              <span className="text-foreground font-medium">{t('limits.resetTitle')}.</span>{' '}
              {t('limits.resetDesc')}
            </p>
            <p>
              <span className="text-foreground font-medium">{t('limits.bankedTitle')}.</span>{' '}
              {t('limits.bankedDesc')}
            </p>
          </div>
        </section>

        {/* === Email and privacy === */}
        <hr className="my-10 border-border/30" />
        <section aria-label="Email and privacy">
          <h2 className="text-lg font-semibold text-foreground">
            <span className="mr-2 font-mono font-normal text-primary">❯</span>
            {t('about.privacyTitle')}
          </h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>{t('about.privacyDesc')}</p>
            <p>{t('about.privacyRetention')}</p>
            <p>{t('about.privacyAbuse')}</p>
          </div>
        </section>

        {/* === Disclaimer === */}
        <hr className="my-10 border-border/30" />
        <section aria-label="Disclaimer">
          <p className="text-sm leading-relaxed text-warning/80">
            {t('model.disclaimerDesc')}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('footer.disclaimer')}
          </p>
        </section>

        {/* Back link */}
        <div className="mt-10 pt-6 border-t border-border/30">
          <Link
            to="/"
            className="font-mono text-sm text-primary hover:underline"
          >
            ← {t('about.backHome')}
          </Link>
        </div>
      </main>
    </div>
  );
}
