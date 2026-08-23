import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSubscribedToPush } from '../src/lib/push-notifications';

describe('browser Push subscription state', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not wait forever for a worker a first-time visitor has not registered', async () => {
    const getRegistration = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration,
        // A deliberately unresolved ready promise models the browser state
        // before any service worker has been registered.
        ready: new Promise(() => {}),
      },
    });
    vi.stubGlobal('window', { PushManager: class PushManager {} });

    await expect(isSubscribedToPush()).resolves.toBe(false);
    expect(getRegistration).toHaveBeenCalledWith('/');
  });
});
