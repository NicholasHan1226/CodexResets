import { useState, useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BellRing, BellOff, Loader2, Smartphone } from 'lucide-react';
import { subscribeToPush, unsubscribeFromPush, isSubscribedToPush, isPushSupported } from '@/lib/push-notifications';

export function PushNotificationPanel() {
  const { t } = useI18n();
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      setSupported(isPushSupported());
      if (isPushSupported()) {
        const isSub = await isSubscribedToPush();
        setSubscribed(isSub);
      }
      setInitializing(false);
    };
    checkStatus();
  }, []);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const result = await subscribeToPush();
      if (result) {
        setSubscribed(true);
      }
    } catch (error) {
      console.error('Push subscription failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setLoading(true);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
    } catch (error) {
      console.error('Push unsubscribe failed:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!supported || initializing) return null;

  return (
    <Card className="p-4 bg-card border-border/30">
      <div className="flex items-center gap-2 mb-3">
        <Smartphone className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">
          {t('push.title') || 'Browser Notifications'}
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {t('push.description') || 'Get instant browser notifications when a Codex reset is imminent.'}
      </p>
      <Button
        onClick={subscribed ? handleUnsubscribe : handleSubscribe}
        disabled={loading}
        size="sm"
        variant={subscribed ? 'outline' : 'default'}
        className={`w-full text-xs ${subscribed ? '' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin mr-1" />
        ) : subscribed ? (
          <BellOff className="w-3 h-3 mr-1" />
        ) : (
          <BellRing className="w-3 h-3 mr-1" />
        )}
        {subscribed
          ? (t('push.disable') || 'Disable Notifications')
          : (t('push.enable') || 'Enable Notifications')}
      </Button>
      {subscribed && (
        <p className="text-xs text-primary mt-2 flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          {t('push.active') || 'Notifications active'}
        </p>
      )}
    </Card>
  );
}

export default PushNotificationPanel;
