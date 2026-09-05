import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loader: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loader) return loader;

  loader = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error('Turnstile failed to load'));
    };
    const timer = setTimeout(fail, 10_000);
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      if (window.turnstile) resolve(window.turnstile);
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch((error) => {
    loader = null;
    throw error;
  });
  return loader;
}

interface TurnstileWidgetProps {
  siteKey: string;
  onToken: (token: string) => void;
  onError: () => void;
}

/** Explicit rendering avoids duplicate widgets across React re-renders. */
export function TurnstileWidget({ siteKey, onToken, onError }: TurnstileWidgetProps) {
  const { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Flexible widgets have a 300px minimum. Narrow forms need the supported
    // compact layout, not clipping or scaling the verification controls.
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 300));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let api: TurnstileApi | undefined;
    let widgetId: string | undefined;

    const handleError = () => {
      if (cancelled) return;
      setFailed(true);
      onError();
    };
    loadTurnstile()
      .then((loaded) => {
        if (cancelled || !containerRef.current) return;
        setFailed(false);
        api = loaded;
        widgetId = api.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'dark',
          size: compact ? 'compact' : 'flexible',
          action: 'subscribe_email',
          callback: (value: string) => {
            if (cancelled) return;
            setFailed(false);
            onToken(value);
          },
          'expired-callback': () => onToken(''),
          'error-callback': handleError,
        });
      })
      .catch(handleError);

    return () => {
      cancelled = true;
      if (api && widgetId) api.remove(widgetId);
      onToken('');
    };
  }, [attempt, compact, onError, onToken, siteKey]);

  return (
    <div>
      <div ref={containerRef} className="min-h-[65px]" />
      {failed && (
        <button type="button" className="min-h-11 text-left text-xs text-primary underline underline-offset-4"
          onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>
          {t('subscribe.retryVerification')}
        </button>
      )}
    </div>
  );
}
