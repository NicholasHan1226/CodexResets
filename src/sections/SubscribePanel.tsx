import { useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { subscribeEmail, type SubscriptionResult } from '@/lib/subscription';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, Check, Loader2 } from 'lucide-react';

export function SubscribePanel() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || loading) return;

    setLoading(true);
    try {
      const result: SubscriptionResult = await subscribeEmail(email);
      if (result.success) {
        setSuccess(true);
        setMessage(result.message);
        setEmail('');
      } else {
        setMessage(result.message);
      }
    } catch {
      setMessage(t('subscribe.errorRetry'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 bg-card border-border/30">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t('subscribe.title')}</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {t('subscribe.description')}
      </p>
      {success ? (
        <div className="flex items-center gap-2 text-primary text-sm">
          <Check className="w-4 h-4" />
          <span>{message || t('subscribe.success')}</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('subscribe.placeholder')}
              className="flex-1 px-3 py-1.5 text-xs bg-background border border-border/40 rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              required
            />
            <Button
              type="submit"
              disabled={loading}
              size="sm"
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : t('subscribe.subscribe')}
            </Button>
          </div>
          {message && !success && (
            <p className="text-xs text-destructive">{message}</p>
          )}
        </form>
      )}
    </Card>
  );
}
