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

const ALERT_THRESHOLD = 70;

function asciiBar(pct: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

interface ResetAlertsPanelProps {
  /** 24h reset probability, 0–1 */
  prob24h: number;
}

export function ResetAlertsPanel({ prob24h }: ResetAlertsPanelProps) {
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

  const armed = emailDone || pushSubscribed;
  const pct = Math.round(prob24h * 100);

  return (
    <section aria-label="Reset alerts" className="max-w-3xl">
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

      {/* Watch well — command echo + live readout + input */}
      <div className="mt-4 max-w-xl border border-border/40 bg-muted/20 transition-colors focus-within:border-primary/50">
        {/* Command echo + live gauge */}
        <div className="border-b border-border/30 px-3 py-2 font-mono text-[11px] leading-relaxed">
          <p className="text-muted-foreground">
            <span className="text-primary">❯</span> {t('subscribe.command')}
          </p>
          <p aria-label={`${t('subscribe.nowLabel')} ${pct}%`}>
            <span className="text-muted-foreground">{t('subscribe.nowLabel')}</span>{' '}
            <span className="text-primary">{asciiBar(pct)}</span>{' '}
            <span className="text-foreground">{pct}%</span>{' '}
            <span className="text-muted-foreground/60">→ {t('subscribe.alertAt', { n: ALERT_THRESHOLD })}</span>
          </p>
        </div>

        {/* Email row / success state */}
        <div className="px-3 py-3">
          {emailDone ? (
            <p className="font-mono text-sm text-primary">
              ✓ {emailMessage}
            </p>
          ) : (
            <form onSubmit={handleEmailSubmit} className="flex items-stretch gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0 font-mono text-sm text-primary">❯</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('subscribe.placeholder')}
                  className="w-full min-w-0 bg-transparent py-1.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
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
            <div className="mt-3 flex items-center gap-3 border-t border-border/20 pt-3">
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
        </div>
      </div>
    </section>
  );
}
