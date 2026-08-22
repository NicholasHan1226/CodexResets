import { describe, expect, it, vi } from 'vitest';
import { handleConfirmEmail, handleHealth, handleSignals, handleSubscribeEmail, handleTestEmail } from '../worker/src/routes';
import type { Env } from '../worker/src/types';
import { detectResetEvents } from '../worker/src/scrape';

function envWith(cacheEntries: Record<string, string | null>): Env {
  return {
    CACHE: {
      get: async (key: string) => cacheEntries[key] ?? null,
      put: async (key: string, value: string) => { cacheEntries[key] = value; },
      delete: async (key: string) => { delete cacheEntries[key]; },
    },
  } as unknown as Env;
}

function emailEnv(cacheEntries: Record<string, string | null> = {}): Env {
  return {
    ...envWith(cacheEntries),
    SUPABASE_URL: 'https://db.example.test',
    SUPABASE_ANON_KEY: 'anon-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    RESEND_API_KEY: 'resend-test-key',
    RESEND_FROM: 'Codex Resets <alerts@example.test>',
    SITE_URL: 'https://codexresets.cc',
    CRON_SECRET: 'cron-test-secret',
  };
}

describe('pipeline read endpoints', () => {
  it('returns a cacheable signal snapshot with browser CORS enabled', async () => {
    const snapshot = JSON.stringify({ signals: [{ source: 'tibopost' }], generatedAt: 123 });
    const response = await handleSignals(envWith({ 'signals:latest': snapshot }));

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    await expect(response.json()).resolves.toEqual(JSON.parse(snapshot));
  });

  it('returns 503 until the first signal snapshot exists', async () => {
    const response = await handleSignals(envWith({}));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'no snapshot yet' });
  });

  it('reports configured delivery capabilities without exposing secret values', async () => {
    const now = new Date().toISOString();
    const response = await handleHealth(envWith({
      'health:last_run': JSON.stringify({ startedAt: now, scrape: 'ok', errors: [] }),
      'signals:latest': JSON.stringify({ generatedAt: Date.now() }),
    }));
    const body = await response.json() as {
      ok: boolean;
      signalsGeneratedAt: number;
      configured: { serviceRole: boolean; resend: boolean; vapid: boolean };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.configured).toMatchObject({ serviceRole: false, resend: false, vapid: false });
  });

  it('returns a failing health status when the cron report is stale or failed', async () => {
    const response = await handleHealth(envWith({
      'health:last_run': JSON.stringify({
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        scrape: 'failed',
        errors: ['scrape: unavailable'],
      }),
      'signals:latest': JSON.stringify({ generatedAt: Date.now() - 2 * 60 * 60 * 1000 }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      checks: { lastRun: 'failed', signals: 'stale' },
    });
  });

  it('keeps an explicit Codex reset notice strong and promotion noise weak', () => {
    const detection = detectResetEvents([
      { ts: 1, link: 'https://example.test/reset', text: 'The banked reset has landed for all paid Codex users.' },
      { ts: 2, link: 'https://example.test/launch', text: 'Codex has 20M active users. What a launch!' },
      { ts: 3, link: 'https://example.test/question', text: 'When do Codex usage limits reset?' },
    ]);

    expect(detection.strong.map((event) => event.link)).toEqual(['https://example.test/reset']);
    expect(detection.weak.map((event) => event.link)).toEqual(['https://example.test/question']);
  });

  it('requires an email confirmation before activating a subscriber', async () => {
    const cache: Record<string, string | null> = {};
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleSubscribeEmail(new Request('https://api.example.test/api/subscribe/email', {
        method: 'POST',
        body: JSON.stringify({ email: 'reader@example.test' }),
      }), emailEnv(cache));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true, status: 'pending' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toMatchObject({
        to: ['reader@example.test'],
        subject: 'Confirm your Codex Resets subscription',
      });
      expect(Object.keys(cache).some((key) => key.startsWith('subscribe:confirm:'))).toBe(true);
      expect(Object.keys(cache).some((key) => key.includes('reader@example.test'))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('activates only a valid pending confirmation token', async () => {
    const token = '01234567-89ab-cdef-0123-456789abcdef';
    const cache: Record<string, string | null> = {
      [`subscribe:confirm:${token}`]: JSON.stringify({ email: 'reader@example.test' }),
    };
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleConfirmEmail(
        new URL(`https://api.example.test/api/subscribe/confirm?t=${token}`),
        emailEnv(cache),
      );

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toContain('Subscription confirmed');
      expect(cache[`subscribe:confirm:${token}`]).toBeUndefined();
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://db.example.test/rest/v1/subscriptions?on_conflict=email');
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual([{ email: 'reader@example.test', is_active: true, unsubscribed_at: null }]);
      expect(new Headers(init.headers).get('apikey')).toBe('service-role-test-key');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('never falls back to an anonymous subscription RPC when the service role is absent', async () => {
    const token = '01234567-89ab-cdef-0123-456789abcdef';
    const cache: Record<string, string | null> = {
      [`subscribe:confirm:${token}`]: JSON.stringify({ email: 'reader@example.test' }),
    };
    const env = emailEnv(cache);
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleConfirmEmail(
        new URL(`https://api.example.test/api/subscribe/confirm?t=${token}`),
        env,
      );

      expect(response.status).toBe(503);
      await expect(response.text()).resolves.toContain('Server not configured');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(cache[`subscribe:confirm:${token}`]).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the delivery exercise cron-protected and single-recipient', async () => {
    const env = emailEnv();
    const unauthorized = await handleTestEmail(new Request('https://api.example.test/api/test-email', {
      method: 'POST',
      body: JSON.stringify({ email: 'reader@example.test' }),
    }), env);
    expect(unauthorized.status).toBe(401);

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'email_2' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleTestEmail(new Request('https://api.example.test/api/test-email', {
        method: 'POST',
        headers: { authorization: 'Bearer cron-test-secret' },
        body: JSON.stringify({ email: 'reader@example.test' }),
      }), env);

      expect(response.status).toBe(200);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toMatchObject({
        to: ['reader@example.test'],
        subject: '[Test] Codex Resets alert delivery',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
