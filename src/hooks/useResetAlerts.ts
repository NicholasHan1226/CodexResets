import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Locale } from '@/lib/i18n';
import { subscribeEmail } from '@/lib/subscription';
import { isPushSupported, isSubscribedToPush, subscribeToPush, unsubscribeFromPush } from '@/lib/push-notifications';

type EmailState = { status: 'idle' | 'submitting' | 'pending' } | { status: 'error'; messageKey: string };
type PushState = { status: 'checking' | 'unsupported' } | { status: 'ready' | 'updating' | 'error'; subscribed: boolean };

export function useResetAlerts(locale: Locale) {
  const [email, setEmail] = useState('');
  const [emailState, setEmailState] = useState<EmailState>({ status: 'idle' });
  const [pushState, setPushState] = useState<PushState>({ status: 'checking' });
  const [verificationOpen, setVerificationOpen] = useState(false);
  const verificationRequest = useRef<{ email: string; locale: Locale } | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    // Browser APIs may reject or never settle in restricted environments.
    const timer = setTimeout(() => {
      cancelled = true;
      setPushState({ status: 'error', subscribed: false });
    }, 8000);
    async function initializePush() {
      try {
        const state: PushState = isPushSupported()
          ? { status: 'ready', subscribed: await isSubscribedToPush() }
          : { status: 'unsupported' };
        if (!cancelled) setPushState(state);
      } catch {
        if (!cancelled) setPushState({ status: 'error', subscribed: false });
      } finally {
        clearTimeout(timer);
      }
    }
    void initializePush();
    return () => {
      mounted.current = false;
      verificationRequest.current = null;
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Consume each explicit subscription intent once, even if a widget callback repeats.
  const onToken = useCallback(async (value: string) => {
    const request = verificationRequest.current;
    if (!value || !request || submitting.current || !mounted.current) return;
    verificationRequest.current = null;
    submitting.current = true;
    setVerificationOpen(false);
    setEmailState({ status: 'submitting' });
    try {
      const status = await subscribeEmail(request.email, value, request.locale);
      if (!mounted.current) return;
      setEmailState(status === 'pending'
        ? { status: 'pending' }
        : { status: 'error', messageKey: 'subscribe.invalidEmail' });
      if (status === 'pending') setEmail('');
    } catch {
      if (mounted.current) setEmailState({ status: 'error', messageKey: 'subscribe.errorRetry' });
    } finally {
      submitting.current = false;
    }
  }, []);

  const onVerificationError = useCallback(() => {
    if (verificationRequest.current) {
      setEmailState({ status: 'error', messageKey: 'subscribe.verificationUnavailable' });
    }
  }, []);

  const cancelVerification = useCallback(() => {
    verificationRequest.current = null;
    setVerificationOpen(false);
    setEmailState({ status: 'idle' });
  }, []);

  function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || submitting.current || verificationRequest.current) return;
    verificationRequest.current = { email, locale };
    setEmailState({ status: 'idle' });
    setVerificationOpen(true);
  }

  async function togglePush() {
    if (!('subscribed' in pushState) || pushState.status === 'updating') return;
    const { subscribed } = pushState;
    setPushState({ status: 'updating', subscribed });
    try {
      const acknowledged = subscribed ? await unsubscribeFromPush() : await subscribeToPush();
      if (!acknowledged) throw new Error('Push request was not acknowledged');
      if (mounted.current) setPushState({ status: 'ready', subscribed: !subscribed });
    } catch {
      if (mounted.current) setPushState({ status: 'error', subscribed });
    }
  }

  return {
    email, setEmail, emailState, pushState, submitEmail, togglePush,
    retryEmail: () => setEmailState({ status: 'idle' }),
    onToken, onVerificationError, verificationOpen, cancelVerification,
  };
}
