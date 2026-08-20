import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { fetchCloudData, pushCloudData } from '@/lib/user-sync';

const USAGE_KEY = 'codex-resets-usage';
const BANKED_KEY = 'codex-resets-banked';
const LAST_SYNC_KEY = 'codex-last-sync';

type SyncState = 'idle' | 'syncing' | 'synced' | 'error';

export function AccountPanel() {
  const { t } = useI18n();
  const { user, loading, signIn, signUp, signOut } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [lastSync, setLastSync] = useState<string | null>(
    () => localStorage.getItem(LAST_SYNC_KEY)
  );

  // Merge local data into cloud on login, pull cloud → local if cloud is newer
  const syncNow = useCallback(async (userId: string) => {
    setSyncState('syncing');
    try {
      const cloud = await fetchCloudData(userId);
      const localUsage = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
      const localBanked = JSON.parse(localStorage.getItem(BANKED_KEY) || '[]');

      const localStamp = localStorage.getItem(LAST_SYNC_KEY);
      const cloudIsNewer =
        cloud && (!localStamp || new Date(cloud.updated_at) > new Date(localStamp));

      if (cloudIsNewer && cloud) {
        // Cloud wins → hydrate local
        if (cloud.usage_data && Object.keys(cloud.usage_data).length > 0) {
          localStorage.setItem(USAGE_KEY, JSON.stringify(cloud.usage_data));
        }
        if (Array.isArray(cloud.banked_resets) && cloud.banked_resets.length > 0) {
          const merged = Array.from(
            new Set([...(cloud.banked_resets as string[]), ...localBanked])
          ).sort().reverse();
          localStorage.setItem(BANKED_KEY, JSON.stringify(merged));
        }
      } else {
        // Local wins (or first sync) → push up
        await pushCloudData(userId, {
          usage_data: localUsage,
          banked_resets: localBanked,
        });
      }

      const stamp = new Date().toISOString();
      localStorage.setItem(LAST_SYNC_KEY, stamp);
      setLastSync(stamp);
      setSyncState('synced');
    } catch {
      setSyncState('error');
    }
  }, []);

  // Auto-sync right after login
  useEffect(() => {
    if (user) syncNow(user.id);
  }, [user, syncNow]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || busy) return;
    setBusy(true);
    setMessage(null);

    const { error } =
      mode === 'signin' ? await signIn(email, password) : await signUp(email, password);

    setBusy(false);
    if (error) {
      setMessage({ text: error, isError: true });
    } else if (mode === 'signup') {
      setMessage({ text: t('account.signupOk'), isError: false });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setSyncState('idle');
    setMessage(null);
  };

  const fmtSync = lastSync
    ? new Date(lastSync).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <section aria-label="Account & sync" className="max-w-3xl">
      <h2 className="text-lg font-semibold text-foreground">{t('account.title')}</h2>

      {loading ? null : user ? (
        <div className="mt-3">
          <p className="font-mono text-sm">
            <span className="text-primary">❯</span>{' '}
            <span className="text-foreground">{user.email}</span>{' '}
            <span className="text-muted-foreground/60">
              {syncState === 'syncing' && t('account.syncing')}
              {syncState === 'synced' && t('account.synced', { time: fmtSync })}
              {syncState === 'error' && t('account.syncError')}
              {syncState === 'idle' && ''}
            </span>
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            <button
              onClick={() => syncNow(user.id)}
              disabled={syncState === 'syncing'}
              className="text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
            >
              [sync]
            </button>
            <span className="mx-2 text-border">·</span>
            <button
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              [sign out]
            </button>
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">{t('account.description')}</p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-2 max-w-sm">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
              className="w-full bg-muted border-none rounded-md px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password (min 6)"
              className="w-full bg-muted border-none rounded-md px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <div className="flex items-center gap-3 font-mono text-sm">
              <button
                type="submit"
                disabled={busy}
                className="text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
              >
                {busy ? '[...]' : mode === 'signin' ? '[sign in]' : '[sign up]'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setMessage(null);
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {mode === 'signin' ? t('account.needAccount') : t('account.haveAccount')}
              </button>
            </div>
          </form>

          {message && (
            <p
              className={`mt-3 font-mono text-xs ${
                message.isError ? 'text-destructive' : 'text-primary'
              }`}
            >
              {message.text}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default AccountPanel;
