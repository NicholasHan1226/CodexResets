import { useState, useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { subscribeEmail, type SubscribeStatus } from '@/lib/subscription';
import { subscribeToPush, unsubscribeFromPush, isSubscribedToPush, isPushSupported } from '@/lib/push-notifications';

const statusMessageKey: Record<SubscribeStatus, string> = {
  new: 'subscribe.success',
  existing: 'subscribe.alreadySubscribed',
  reactivated: 'subscribe.welcomeBack',
  invalid: 'subscribe.invalidEmail',
};

export function ResetAlertsPanel() {
  const { t } = useI18n();

  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailDone, setEmailDone] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState(false);

  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushInit, setPushInit] = useState(true);

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
    setEmailLoading(true);
    setEmailError(false);
    try {
      const status = await subscribeEmail(email);
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
      setEmailLoading(false);
    }
  };

  const handlePushToggle = async () => {
    setPushLoading(true);
    try {
      if (pushSubscribed) {
        await unsubscribeFromPush();
        setPushSubscribed(false);
      } else {
        const result = await subscribeToPush();
        if (result) setPushSubscribed(true);
      }
    } catch (error) {
      console.error('Push toggle failed:', error);
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <section aria-label="Reset alerts" className="max-w-3xl">
      <h2 className="text-lg font-semibold text-foreground">
        <span className="mr-2 font-mono font-normal text-primary">❯</span>
        {t('subscribe.title')}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('subscribe.description')}
      </p>

      {/* Email — terminal prompt well + reverse-video CTA */}
      {emailDone ? (
        <p className="mt-4 font-mono text-sm text-primary">
          ✓ {emailMessage}
        </p>
      ) : (
        <form onSubmit={handleEmailSubmit} className="mt-4 flex max-w-md items-stretch gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 border border-border/40 bg-muted px-3 transition-colors focus-within:border-primary/50">
            <span className="shrink-0 font-mono text-sm text-primary">❯</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('subscribe.placeholder')}
              className="w-full min-w-0 bg-transparent py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={emailLoading}
            className="shrink-0 bg-primary px-4 font-mono text-xs font-semibold uppercase tracking-wider text-background transition-colors hover:bg-primary/85 disabled:opacity-50"
          >
            {emailLoading ? '···' : t('subscribe.button')}
          </button>
        </form>
      )}
      {emailMessage && !emailDone && (
        <p className={`mt-2 font-mono text-xs ${emailError ? 'text-destructive' : 'text-muted-foreground'}`}>
          {emailMessage}
        </p>
      )}

      {/* Browser push — secondary bordered action */}
      {!pushInit && pushSupported && (
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handlePushToggle}
            disabled={pushLoading}
            className={`border px-3 py-1.5 font-mono text-xs transition-colors disabled:opacity-50 ${
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
        </div>
      )}
    </section>
  );
}
