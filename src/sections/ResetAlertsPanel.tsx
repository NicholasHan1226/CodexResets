import { useI18n } from '@/contexts/I18nContext';
import { useResetAlerts } from '@/hooks/useResetAlerts';
import { TurnstileWidget } from '@/components/TurnstileWidget';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

export function AlertStatusBadge({ emailPending, pushSubscribed }: { emailPending: boolean; pushSubscribed: boolean }) {
  const { t } = useI18n();
  const statusKey = pushSubscribed ? 'subscribe.armed' : emailPending ? 'subscribe.awaitingConfirmation' : 'subscribe.standby';
  return (
    <span role="status" className={`px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
      pushSubscribed ? 'bg-primary text-background' : 'text-muted-foreground'
    }`}>
      {t(statusKey)}
    </span>
  );
}

export function EmailConfirmationPending({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <p className="text-sm font-medium text-primary">{t('subscribe.confirmationSent')}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{t('subscribe.pendingHelp')}</p>
      <button type="button" onClick={onRetry} className="min-h-11 text-left font-mono text-xs text-foreground underline underline-offset-4 hover:text-primary">
        {t('subscribe.tryAnother')}
      </button>
    </div>
  );
}

export function ResetAlertsPanel() {
  const { t, locale } = useI18n();

  const {
    email, setEmail, emailState, pushState, submitEmail, togglePush, retryEmail,
    onToken, onVerificationError, onVerificationReady,
  } = useResetAlerts(locale);
  const emailPending = emailState.status === 'pending';
  const emailLoading = emailState.status === 'submitting';
  const pushSubscribed = 'subscribed' in pushState && pushState.subscribed;
  const pushLoading = pushState.status === 'updating';

  return (
    <section aria-label="Reset alerts" className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">
          <span className="mr-2 font-mono font-normal text-primary">❯</span>
          {t('subscribe.title')}
        </h2>
        {(emailPending || pushSubscribed) && <AlertStatusBadge emailPending={emailPending} pushSubscribed={pushSubscribed} />}
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {t('subscribe.description')}
      </p>

      <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-start md:gap-8">
        <div className="min-w-0 border border-primary/25 bg-muted/20 p-4 transition-colors focus-within:border-primary/60">
          <h3 className="text-sm font-semibold text-foreground">{t('subscribe.emailTitle')}</h3>
          <p id="reset-alert-email-help" className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('subscribe.emailNote')}</p>
          <div className="mt-4">
            {emailPending ? (
              <EmailConfirmationPending onRetry={retryEmail} />
            ) : (
              <form onSubmit={submitEmail} className="space-y-3" aria-busy={emailLoading}>
                <div className="flex flex-wrap items-stretch gap-2">
                  <label className="sr-only" htmlFor="reset-alert-email">{t('subscribe.placeholder')}</label>
                  <input
                    id="reset-alert-email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    aria-describedby={`reset-alert-email-help${emailState.status === 'error' ? ' reset-alert-email-error' : ''}`}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('subscribe.placeholder')}
                    className="min-h-11 min-w-0 flex-[1_1_160px] border border-border/50 bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                    required
                  />
                  <button
                    type="submit"
                    disabled={emailLoading || !TURNSTILE_SITE_KEY}
                    className="min-h-11 shrink-0 bg-primary px-4 font-mono text-xs font-semibold uppercase tracking-wider text-background transition-colors hover:bg-primary/85 disabled:opacity-50"
                  >
                    {emailLoading ? '···' : t('subscribe.button')}
                  </button>
                </div>
                {TURNSTILE_SITE_KEY ? (
                  <TurnstileWidget
                    siteKey={TURNSTILE_SITE_KEY}
                    onToken={onToken}
                    onError={onVerificationError}
                    onReady={onVerificationReady}
                  />
                ) : (
                  <p role="alert" className="text-xs leading-relaxed text-destructive">{t('subscribe.verificationUnavailable')}</p>
                )}
              </form>
            )}
            {emailState.status === 'error' && (
              <p id="reset-alert-email-error" role="alert" className="mt-2 text-xs leading-relaxed text-destructive">
                {t(emailState.messageKey)}
              </p>
            )}
          </div>

          <div className="mt-4 border-t border-border/30 pt-3">
            <p className="text-xs leading-relaxed text-muted-foreground">{t('push.description')}</p>
            {pushState.status !== 'checking' && (pushState.status !== 'unsupported' ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  onClick={togglePush}
                  disabled={pushLoading}
                  className="min-h-11 text-left font-mono text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {pushLoading ? '···' : pushSubscribed ? t('push.unsubscribe') : t('push.disabled')}
                </button>
                {pushSubscribed && <span role="status" className="text-xs text-primary">{t('push.enabled')}</span>}
                {pushState.status === 'error' && <span role="alert" className="text-xs text-destructive">{t('push.errorRetry')}</span>}
              </div>
            ) : <p className="mt-2 text-xs text-muted-foreground/70">{t('push.notSupported')}</p>)}
          </div>
        </div>
        <ul className="space-y-3" aria-label={t('subscribe.title')}>
          {(['forecast', 'scheduled', 'confirmed'] as const).map((kind) => (
            <li key={kind} className="flex gap-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">{t(`subscribe.${kind}Title`)}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(`subscribe.${kind}Detail`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
