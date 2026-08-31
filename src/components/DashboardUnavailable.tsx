import { useI18n } from '@/contexts/I18nContext';
import { GuideLinks } from '@/components/GuideLinks';

interface DashboardUnavailableProps {
  onRetry: () => void;
}

/** A fail-closed production state: no probability is shown without live inputs. */
export function DashboardUnavailable({ onRetry }: DashboardUnavailableProps) {
  const { t, locale } = useI18n();

  return (
    <main className="flex min-h-screen items-center bg-background px-4" aria-live="polite">
      <section className="mx-auto w-full max-w-xl border border-border/40 bg-muted/10 p-6 sm:p-8">
        <p className="font-mono text-sm text-primary">❯ monitor paused</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{t('availability.title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t('availability.description')}</p>
        <div className="mt-6 flex flex-wrap gap-3 font-mono text-xs">
          <button onClick={onRetry} className="command-action text-primary">{t('availability.retry')}</button>
          <a href="/about/" className="command-action text-muted-foreground hover:text-foreground">{t('availability.docs')}</a>
          <a href={locale === 'zh' ? '/zh/codex-reset-prediction/' : '/guides/codex-reset-prediction/'} className="command-action text-muted-foreground hover:text-foreground">{t('availability.guides')}</a>
        </div>
        <GuideLinks className="mt-6 font-mono text-xs" />
      </section>
    </main>
  );
}
