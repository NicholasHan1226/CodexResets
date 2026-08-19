import { useState, useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { subscribeEmail, type SubscriptionResult } from '@/lib/subscription';
import { Bell, Check, Loader2, Mail, Smartphone, BellRing, BellOff } from 'lucide-react';
import { subscribeToPush, unsubscribeFromPush, isSubscribedToPush, isPushSupported } from '@/lib/push-notifications';

export function ResetAlertsPanel() {
  const { t } = useI18n();

  // Email subscription state
  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');

  // Push notification state
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
    <section className="bg-card rounded-lg shadow-card p-5" aria-label="Reset alerts">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Bell className="w-4 h-4 text-primary" />
        {t('subscribe.title')}
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {t('subscribe.description')}
      </p>

      {/* Email subscription */}
      {emailSuccess ? (
        <div className="mt-4 flex items-center gap-2 text-primary text-xs">
          <Check className="w-4 h-4" />
          <span>{emailMessage || t('subscribe.success')}</span>
        </div>
      ) : (
        <form onSubmit={handleEmailSubmit} className="mt-4 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('subscribe.placeholder')}
            className="flex-1 min-w-0 bg-muted border-none rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
            required
          />
          <button
            type="submit"
            disabled={emailLoading}
            className="shrink-0 bg-primary text-primary-foreground px-3 py-2 rounded-md text-xs font-medium hover:opacity-90 active:scale-[0.98] transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {emailLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Mail className="w-3.5 h-3.5" />
                {t('subscribe.subscribe')}
              </>
            )}
          </button>
        </form>
      )}
      {emailMessage && !emailSuccess && (
        <p className="mt-1.5 text-[11px] text-destructive">{emailMessage}</p>
      )}

      {/* Divider */}
      <div className="my-4 border-t border-border/10" />

      {/* Browser push toggle */}
      {!pushInit && pushSupported && (
        <button
          onClick={handlePushToggle}
          disabled={pushLoading}
          aria-pressed={pushSubscribed}
          className="w-full flex items-center justify-between bg-muted border-none rounded-md px-3 py-2.5 hover:bg-muted/80 transition-colors disabled:opacity-50"
        >
          <span className="flex items-center gap-2 text-xs text-foreground">
            {pushSubscribed ? (
              <BellRing className="w-4 h-4 text-primary" />
            ) : (
              <Smartphone className="w-4 h-4 text-muted-foreground" />
            )}
            {pushSubscribed ? (t('push.enabled') || 'Browser push enabled') : (t('push.disabled') || 'Enable browser push')}
          </span>
          {pushLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : (
            <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${
              pushSubscribed ? 'bg-primary/40' : 'bg-muted-foreground/20'
            }`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                pushSubscribed
                  ? 'right-0.5 bg-primary'
                  : 'left-0.5 bg-muted-foreground'
              }`} />
            </span>
          )}
        </button>
      )}

      {/* Unsubscribe option */}
      {pushSubscribed && (
        <button
          onClick={handlePushToggle}
          className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <BellOff className="w-3 h-3" />
          {t('push.unsubscribe') || 'Disable notifications'}
        </button>
      )}
    </section>
  );
}
