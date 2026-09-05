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
  const token = useRef('');
  const turnstileReset = useRef<(() => void) | null>(null);
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
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Stable callbacks prevent the verification widget remounting on locale changes.
  const onToken = useCallback((value: string) => {
    token.current = value;
    if (value) setEmailState((state) => state.status === 'error'
      && (state.messageKey === 'subscribe.verificationUnavailable' || state.messageKey === 'subscribe.verificationRequired')
      ? { status: 'idle' } : state);
  }, []);
  const onVerificationError = useCallback(() => {
    token.current = '';
    setEmailState((state) => state.status === 'submitting' || state.status === 'pending'
      ? state : { status: 'error', messageKey: 'subscribe.verificationUnavailable' });
  }, []);
  const onVerificationReady = useCallback((reset: (() => void) | null) => {
    turnstileReset.current = reset;
  }, []);

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (!email || emailState.status === 'submitting') return;
    if (!token.current) {
      setEmailState({ status: 'error', messageKey: 'subscribe.verificationRequired' });
      return;
    }
    setEmailState({ status: 'submitting' });
    try {
      const status = await subscribeEmail(email, token.current, locale);
      if (!mounted.current) return;
      setEmailState(status === 'pending'
        ? { status: 'pending' }
        : { status: 'error', messageKey: 'subscribe.invalidEmail' });
      if (status === 'pending') setEmail('');
    } catch {
      if (mounted.current) setEmailState({ status: 'error', messageKey: 'subscribe.errorRetry' });
    } finally {
      token.current = '';
      if (mounted.current) turnstileReset.current?.();
    }
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
    onToken, onVerificationError, onVerificationReady,
  };
}
