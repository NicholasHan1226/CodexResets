import { useState, useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { subscribeEmail, type SubscriptionResult } from '@/lib/subscription';
import { subscribeToPush, unsubscribeFromPush, isSubscribedToPush, isPushSupported } from '@/lib/push-notifications';

export function ResetAlertsPanel() {
  const { t } = useI18n();

  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');

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
    try {
      const result: SubscriptionResult = await subscribeEmail(email);
      if (result.success) {
        setEmailSuccess(true);
        setEmailMessage(result.message);
        setEmail('');
      } else {
        setEmailMessage(result.message);
      }
    } catch {
      setEmailMessage(t('subscribe.errorRetry'));
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
        {t('subscribe.title')}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('subscribe.description')}
      </p>

      {/* Email */}
      {emailSuccess ? (
        <p className="mt-3 text-sm text-primary">
          {emailMessage || t('subscribe.success')}
        </p>
      ) : (
        <form onSubmit={handleEmailSubmit} className="mt-3 flex gap-2 max-w-sm">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('subscribe.placeholder')}
            className="flex-1 min-w-0 bg-muted border border-border/20 rounded-md px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 transition-colors"
            required
          />
          <button
            type="submit"
            disabled={emailLoading}
            className="shrink-0 font-mono text-xs text-primary hover:underline disabled:opacity-50"
          >
            {emailLoading ? '...' : `[${t('subscribe.subscribe')}]`}
          </button>
        </form>
      )}
      {emailMessage && !emailSuccess && (
        <p className="mt-1 text-xs text-destructive">{emailMessage}</p>
      )}

      {/* Browser push */}
      {!pushInit && pushSupported && (
        <div className="mt-3">
          <button
            onClick={handlePushToggle}
            disabled={pushLoading}
            className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {pushLoading
              ? '...'
              : pushSubscribed
                ? `[${t('push.unsubscribe')}]`
                : `[${t('push.disabled')}]`}
          </button>
          {pushSubscribed && (
            <span className="ml-2 font-mono text-xs text-primary">
              {t('push.enabled')}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
