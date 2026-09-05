import { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { subscribeEmail, type SubscribeStatus } from '@/lib/subscription';
import { subscribeToPush, unsubscribeFromPush, isSubscribedToPush, isPushSupported } from '@/lib/push-notifications';
import { TurnstileWidget } from '@/components/TurnstileWidget';

const statusMessageKey: Record<SubscribeStatus, string> = {
  pending: 'subscribe.confirmationSent',
  invalid: 'subscribe.invalidEmail',
};

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

  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailPending, setEmailPending] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileReset = useRef<(() => void) | null>(null);
  const handleTurnstileError = useCallback(() => {
    setTurnstileToken('');
    setEmailMessage(t('subscribe.verificationUnavailable'));
    setEmailError(true);
  }, [t]);
  const setTurnstileReset = useCallback((reset: (() => void) | null) => {
    turnstileReset.current = reset;
  }, []);

  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushInit, setPushInit] = useState(true);
  const [pushError, setPushError] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      setPushSupported(isPushSupported());
      if (isPushSupported()) {
        const isSub = await isSubscribedToPush();
        setPushSubscribed(isSub);
      }
      setPushInit(false);
    };
    checkStatus();
  }, []);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || emailLoading) return;
    if (!turnstileToken) {
      setEmailMessage(t('subscribe.verificationRequired'));
      setEmailError(true);
      return;
    }
    setEmailLoading(true);
    setEmailError(false);
    try {
      const status = await subscribeEmail(email, turnstileToken, locale);
      setEmailMessage(t(statusMessageKey[status]));
      if (status === 'invalid') {
        setEmailError(true);
      } else {
        setEmailPending(true);
        setEmail('');
      }
    } catch {
      setEmailMessage(t('subscribe.errorRetry'));
      setEmailError(true);
    } finally {
      setTurnstileToken('');
      turnstileReset.current?.();
      setEmailLoading(false);
    }
  };

  const handlePushToggle = async () => {
    setPushLoading(true);
    setPushError(false);
    try {
      if (pushSubscribed) {
        const removed = await unsubscribeFromPush();
        if (!removed) throw new Error('Push unsubscription was not acknowledged');
        setPushSubscribed(false);
      } else {
        const result = await subscribeToPush();
        if (!result) throw new Error('Push subscription was not acknowledged');
        setPushSubscribed(true);
      }
    } catch (error) {
      console.error('Push toggle failed:', error);
      setPushError(true);
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <section aria-label="Reset alerts" className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">
          <span className="mr-2 font-mono font-normal text-primary">❯</span>
          {t('subscribe.title')}
        </h2>
        <AlertStatusBadge emailPending={emailPending} pushSubscribed={pushSubscribed} />
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {t('subscribe.description')}
      </p>

      <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-start md:gap-8">
        <ol className="space-y-4" aria-label={t('subscribe.title')}>
          {(['forecast', 'scheduled', 'confirmed'] as const).map((kind, index) => (
            <li key={kind} className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 font-mono text-xs text-primary/70">0{index + 1}</span>
              <div>
                <h3 className="text-sm font-medium text-foreground">{t(`subscribe.${kind}Title`)}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(`subscribe.${kind}Detail`)}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="min-w-0 border border-primary/25 bg-muted/20 p-4 transition-colors focus-within:border-primary/60">
          <h3 className="text-sm font-semibold text-foreground">{t('subscribe.emailTitle')}</h3>
          <p id="reset-alert-email-help" className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('subscribe.emailNote')}</p>
          <div className="mt-4">
            {emailPending ? (
              <EmailConfirmationPending onRetry={() => { setEmailPending(false); setEmailMessage(''); setEmailError(false); }} />
            ) : (
              <form onSubmit={handleEmailSubmit} className="space-y-3" aria-busy={emailLoading}>
                <div className="flex flex-wrap items-stretch gap-2">
                  <label className="sr-only" htmlFor="reset-alert-email">{t('subscribe.placeholder')}</label>
                  <input
                    id="reset-alert-email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    aria-describedby={`reset-alert-email-help${emailError && emailMessage ? ' reset-alert-email-error' : ''}`}
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
                    onToken={setTurnstileToken}
                    onError={handleTurnstileError}
                    onReady={setTurnstileReset}
                  />
                ) : (
                  <p role="alert" className="text-xs leading-relaxed text-destructive">{t('subscribe.verificationUnavailable')}</p>
                )}
              </form>
            )}
            {emailMessage && !emailPending && (
              <p id="reset-alert-email-error" role={emailError ? 'alert' : 'status'} className={`mt-2 text-xs leading-relaxed ${emailError ? 'text-destructive' : 'text-muted-foreground'}`}>
                {emailMessage}
              </p>
            )}
          </div>

          <div className="mt-4 border-t border-border/30 pt-3">
            <p className="text-xs leading-relaxed text-muted-foreground">{t('push.description')}</p>
            {!pushInit && (pushSupported ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  onClick={handlePushToggle}
                  disabled={pushLoading}
                  className="min-h-11 text-left font-mono text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {pushLoading ? '···' : pushSubscribed ? t('push.unsubscribe') : t('push.disabled')}
                </button>
                {pushSubscribed && <span role="status" className="text-xs text-primary">{t('push.enabled')}</span>}
                {pushError && <span role="alert" className="text-xs text-destructive">{t('push.errorRetry')}</span>}
              </div>
            ) : <p className="mt-2 text-xs text-muted-foreground/70">{t('push.notSupported')}</p>)}
          </div>
        </div>
      </div>
      <p className="mt-4 max-w-2xl text-xs leading-relaxed text-muted-foreground/80">{t('subscribe.scope')}</p>
    </section>
  );
}
