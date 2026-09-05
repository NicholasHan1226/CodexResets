import { useEffect, useRef } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { TurnstileWidget } from '@/components/TurnstileWidget';

interface VerificationDialogProps {
  siteKey: string;
  onToken: (token: string) => void;
  onError: () => void;
  onCancel: () => void;
  error?: string;
}

/** Native modal provides focus containment and Escape without a new UI dependency. */
export function VerificationDialog({ siteKey, onToken, onError, onCancel, error }: VerificationDialogProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog ref={dialogRef} aria-labelledby="verification-title" aria-describedby="verification-help"
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-sm border border-border bg-background p-5 text-foreground backdrop:bg-black/70">
      <h2 id="verification-title" className="text-lg font-semibold">{t('subscribe.verifyTitle')}</h2>
      <p id="verification-help" className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('subscribe.verifyHelp')}</p>
      <div className="mt-5">
        <TurnstileWidget siteKey={siteKey} onToken={onToken} onError={onError} />
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
      <button type="button" onClick={onCancel} className="mt-4 min-h-11 font-mono text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
        {t('subscribe.cancelVerification')}
      </button>
    </dialog>
  );
}
