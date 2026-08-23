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

export function ResetAlertsPanel() {
  const { t } = useI18n();

  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailDone, setEmailDone] = useState(false);
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
      const status = await subscribeEmail(email, turnstileToken);
      setEmailMessage(t(statusMessageKey[status]));
      if (status === 'invalid') {
        setEmailError(true);
      } else {
        setEmailDone(true);
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

  const armed = emailDone || pushSubscribed;
  return (
    <section aria-label="Reset alerts" className="max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          <span className="mr-2 font-mono font-normal text-primary">❯</span>
          {t('subscribe.title')}
        </h2>
        <span
          className={`px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
            armed
              ? 'bg-primary text-background'
              : 'text-muted-foreground/50'
          }`}
        >
          {armed ? t('subscribe.armed') : t('subscribe.standby')}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('subscribe.description')}
      </p>

      {/* Alerts are sent after a reset is confirmed, never at a forecast threshold. */}
      <div className="mt-4 max-w-xl border border-border/40 bg-muted/20 transition-colors focus-within:border-primary/50">
        {/* Command echo */}
        <div className="border-b border-border/30 px-3 py-2 font-mono text-[11px] leading-relaxed">
          <p className="text-muted-foreground">
            <span className="text-primary">❯</span> {t('subscribe.command')}
          </p>
        </div>

        {/* Email row / success state */}
        <div className="px-3 py-3">
          {emailDone ? (
            <p className="font-mono text-sm text-primary">
              ✓ {emailMessage}
            </p>
          ) : (
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <div className="flex items-stretch gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <label className="sr-only" htmlFor="reset-alert-email">{t('subscribe.placeholder')}</label>
                  <span className="shrink-0 font-mono text-sm text-primary">❯</span>
                  <input
                    id="reset-alert-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('subscribe.placeholder')}
                    className="min-h-11 w-full min-w-0 bg-transparent py-1.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                    required
                  />
                </div>
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
                <p className="font-mono text-xs text-destructive">{t('subscribe.verificationUnavailable')}</p>
              )}
            </form>
          )}
          {emailMessage && !emailDone && (
            <p className={`mt-2 font-mono text-xs ${emailError ? 'text-destructive' : 'text-muted-foreground'}`}>
              {emailMessage}
            </p>
          )}

          {/* Browser push — secondary bordered action */}
          {!pushInit && pushSupported && (
            <div className="mt-3 flex items-center gap-3 border-t border-border/20 pt-3">
              <button
                onClick={handlePushToggle}
                disabled={pushLoading}
                className={`min-h-11 border px-3 py-1.5 font-mono text-xs transition-colors disabled:opacity-50 ${
                  pushSubscribed
                    ? 'border-primary/40 text-primary hover:border-primary/60'
                    : 'border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}
              >
                {pushLoading
                  ? '···'
                  : pushSubscribed
                    ? t('push.unsubscribe')
                    : t('push.disabled')}
              </button>
              {pushSubscribed && (
                <span className="font-mono text-xs text-primary">
                  ● {t('push.enabled')}
                </span>
              )}
              {pushError && (
                <span className="font-mono text-xs text-destructive">
                  {t('push.errorRetry')}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
