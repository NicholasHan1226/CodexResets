import { useEffect, useRef } from 'react';

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
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

  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not initialize'));
    script.onerror = () => reject(new Error('Turnstile failed to load'));
    document.head.appendChild(script);
  });
  return loader;
}

interface TurnstileWidgetProps {
  siteKey: string;
  onToken: (token: string) => void;
  onError: () => void;
  onReady: (reset: (() => void) | null) => void;
}

/** Explicit rendering avoids duplicate widgets across React re-renders. */
export function TurnstileWidget({ siteKey, onToken, onError, onReady }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let api: TurnstileApi | undefined;
    let widgetId: string | undefined;

    loadTurnstile()
      .then((loaded) => {
        if (cancelled || !containerRef.current) return;
        api = loaded;
        widgetId = api.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'dark',
          size: 'flexible',
          action: 'subscribe_email',
          callback: onToken,
          'expired-callback': () => onToken(''),
          'error-callback': onError,
        });
        onReady(() => {
          if (widgetId) api?.reset(widgetId);
          onToken('');
        });
      })
      .catch(onError);

    return () => {
      cancelled = true;
      onReady(null);
      if (api && widgetId) api.remove(widgetId);
    };
  }, [onError, onReady, onToken, siteKey]);

  return <div ref={containerRef} className="min-h-[65px]" />;
}
