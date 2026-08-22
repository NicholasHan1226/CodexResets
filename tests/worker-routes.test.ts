import { describe, expect, it, vi } from 'vitest';
import { handleConfirmEmail, handleHealth, handleResendWebhook, handleSignals, handleSubscribeEmail, handleTestEmail } from '../worker/src/routes';
import { sendHealthAlert } from '../worker/src/notify';
import { isExpiredPushEndpoint } from '../worker/src/notify';
import { getStatusEvidence } from '../worker/src/signals';
import { shouldSendHealthAlert } from '../worker/src/pipeline';
import type { Env, RunReport } from '../worker/src/types';
import { detectResetEvents, detectResetRetractions, isRetractionForCandidate, isTimelyAutomatedCandidate, scrapeTweets } from '../worker/src/scrape';

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
    TURNSTILE_SECRET: 'turnstile-test-secret',
    SITE_URL: 'https://codexresets.cc',
    CRON_SECRET: 'cron-test-secret',
    HEALTH_ALERT_EMAIL: 'ops@example.test',
    RESEND_WEBHOOK_SECRET: 'whsec_c2VjcmV0',
  };
}

async function resendWebhookRequest(body: string, id = 'msg_test_123'): Promise<Request> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return new Request('https://api.example.test/api/webhooks/resend', {
    method: 'POST',
    headers: {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${Buffer.from(signature).toString('base64')}`,
    },
    body,
  });
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
      configured: { serviceRole: boolean; resend: boolean; vapid: boolean; healthAlert: boolean };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.configured).toMatchObject({ serviceRole: false, resend: false, vapid: false, healthAlert: false });
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

  it('reports a compact non-PII daily delivery roll-up in operational health', async () => {
    const now = new Date().toISOString();
    const date = now.slice(0, 10);
    const response = await handleHealth(envWith({
      'health:last_run': JSON.stringify({ startedAt: now, scrape: 'ok', errors: [] }),
      'signals:latest': JSON.stringify({ generatedAt: Date.now() }),
      [`metrics:delivery:${date}`]: JSON.stringify({ date, runs: 2, emails: 1, pushes: 0 }),
    }));
    await expect(response.json()).resolves.toMatchObject({ deliveryToday: { runs: 2, emails: 1 } });
  });

  it('classifies 404 and 410 push responses as safely removable endpoints', () => {
    expect(isExpiredPushEndpoint(404)).toBe(true);
    expect(isExpiredPushEndpoint(410)).toBe(true);
    expect(isExpiredPushEndpoint(503)).toBe(false);
  });

  it('waits for repeated direct-source outages before sending an operational email', () => {
    expect(shouldSendHealthAlert({
      scrape: 'failed',
      directSourceFailures: 1,
      errors: ['scrape: upstream mirrors unavailable'],
    } as RunReport)).toBe(false);
    expect(shouldSendHealthAlert({
      scrape: 'failed',
      directSourceFailures: 3,
      errors: ['scrape: upstream mirrors unavailable'],
    } as RunReport)).toBe(true);
    expect(shouldSendHealthAlert({
      scrape: 'ok',
      errors: ['records read: upstream unavailable'],
    } as RunReport)).toBe(true);
  });

  it('uses an official relevant incident only as a hold signal', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      incidents: [
        { name: 'Codex rate limit errors', status: 'investigating', resolved_at: null },
        { name: 'Unrelated incident', status: 'investigating', resolved_at: null },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(getStatusEvidence()).resolves.toEqual({ state: 'incident', incidentCount: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
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

  it('finds later correction language so pending automated notices can be withdrawn', () => {
    const retractions = detectResetRetractions([
      { ts: 1, link: 'https://example.test/correction', text: 'Correction: the Codex banked reset was delayed and has not landed yet.' },
      { ts: 2, link: 'https://example.test/normal', text: 'Codex usage limits reset for paid users.' },
    ]);

    expect(retractions.map((event) => event.link)).toEqual(['https://example.test/correction']);
  });

  it('limits automatic delivery to timely candidates and matching correction topics', () => {
    const now = Date.parse('2026-08-22T12:00:00Z');
    const banked = { ts: now - 60_000, link: 'https://example.test/banked', text: 'The banked reset has landed for Codex users.' };
    const quotaCorrection = { ts: now, link: 'https://example.test/quota', text: 'Correction: the Codex quota reset was delayed.' };
    const bankedCorrection = { ts: now, link: 'https://example.test/banked-correction', text: 'Correction: the Codex banked reset was delayed.' };
    const genericCorrection = { ts: now, link: 'https://example.test/generic', text: 'Correction: the Codex reset was delayed.' };

    expect(isTimelyAutomatedCandidate(banked, now)).toBe(true);
    expect(isTimelyAutomatedCandidate({ ...banked, ts: now - 49 * 60 * 60 * 1000 }, now)).toBe(false);
    expect(isRetractionForCandidate(banked, quotaCorrection)).toBe(false);
    expect(isRetractionForCandidate(banked, genericCorrection)).toBe(false);
    expect(isRetractionForCandidate(banked, bankedCorrection)).toBe(true);
  });

  it('uses Google News as a healthy degraded source when every social mirror is unavailable', async () => {
    const feed = `<?xml version="1.0"?><rss><channel><item>
      <title>Codex usage limits reset for subscribers</title>
      <link>https://example.test/reset-news</link>
      <pubDate>Sat, 22 Aug 2026 05:24:00 GMT</pubDate>
    </item></channel></rss>`;
    const fetchMock = vi.fn(async (input: string) => {
      if (input.startsWith('https://news.google.com/')) return new Response(feed, { status: 200 });
      return new Response('unavailable', { status: 503 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await scrapeTweets({
        ...envWith({}),
        RSSHUB_INSTANCES: 'https://rss.example.test',
        TARGET_ACCOUNT: 'thsottiaux',
      });

      expect(result).toMatchObject({ ok: true, instance: 'google-news', sourceKind: 'degraded' });
      expect(result.tweets).toHaveLength(1);
      expect(result.tweets[0]?.link).toBe('https://example.test/reset-news');
      expect(result.attempted).toHaveLength(7);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('requires an email confirmation before activating a subscriber', async () => {
    const cache: Record<string, string | null> = {};
    const fetchMock = vi.fn(async (input: string) => {
      if (input === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
        return new Response(JSON.stringify({ success: true, action: 'subscribe_email' }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleSubscribeEmail(new Request('https://api.example.test/api/subscribe/email', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.17' },
        body: JSON.stringify({ email: 'reader@example.test', turnstileToken: 'turnstile-response' }),
      }), emailEnv(cache));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true, status: 'pending' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [, verifyInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(verifyInit.body))).toMatchObject({
        secret: 'turnstile-test-secret',
        response: 'turnstile-response',
        remoteip: '203.0.113.17',
      });
      const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toMatchObject({
        to: ['reader@example.test'],
        subject: 'Confirm Codex Resets subscription / 确认 Codex 重置提醒订阅',
      });
      expect(Object.keys(cache).some((key) => key.startsWith('subscribe:confirm:'))).toBe(true);
      expect(Object.keys(cache).some((key) => key.includes('reader@example.test'))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects an unverified email intake without sending a confirmation', async () => {
    const cache: Record<string, string | null> = {};
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleSubscribeEmail(new Request('https://api.example.test/api/subscribe/email', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.18' },
        body: JSON.stringify({ email: 'reader@example.test', turnstileToken: 'invalid-response' }),
      }), emailEnv(cache));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: 'subscription verification failed' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(Object.keys(cache).some((key) => key.startsWith('subscribe:confirm:'))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('limits repeated email intake attempts from the same network address', async () => {
    const cache: Record<string, string | null> = {};
    const fetchMock = vi.fn(async (input: string) => {
      if (input === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
        return new Response(JSON.stringify({ success: true, action: 'subscribe_email' }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await handleSubscribeEmail(new Request('https://api.example.test/api/subscribe/email', {
          method: 'POST',
          headers: { 'cf-connecting-ip': '203.0.113.19' },
          body: JSON.stringify({ email: 'reader@example.test', turnstileToken: `turnstile-${attempt}` }),
        }), emailEnv(cache));
        expect(response.status).toBe(200);
      }

      const limited = await handleSubscribeEmail(new Request('https://api.example.test/api/subscribe/email', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.19' },
        body: JSON.stringify({ email: 'reader@example.test', turnstileToken: 'turnstile-6' }),
      }), emailEnv(cache));

      expect(limited.status).toBe(429);
      await expect(limited.json()).resolves.toEqual({ error: 'too many subscription attempts; try again later' });
      expect(fetchMock).toHaveBeenCalledTimes(6);
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

  it('deletes bounced email addresses only after verifying the raw Resend signature', async () => {
    const cache: Record<string, string | null> = {};
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const body = JSON.stringify({ type: 'email.bounced', data: { to: ['bounced@example.test'] } });
      const response = await handleResendWebhook(await resendWebhookRequest(body), emailEnv(cache));

      expect(response.status).toBe(200);
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://db.example.test/rest/v1/subscriptions?email=eq.bounced%40example.test');
      expect(Object.keys(cache).some((key) => key.startsWith('resend:webhook:msg_test_123'))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects unsigned Resend requests before touching subscriptions', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleResendWebhook(new Request('https://api.example.test/api/webhooks/resend', {
        method: 'POST',
        headers: { 'svix-id': 'msg_fake', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,invalid' },
        body: JSON.stringify({ type: 'email.complained', data: { to: ['reader@example.test'] } }),
      }), emailEnv());

      expect(response.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('deduplicates a valid Resend webhook delivery', async () => {
    const cache: Record<string, string | null> = {};
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const body = JSON.stringify({ type: 'email.complained', data: { to: ['reader@example.test'] } });
      const first = await handleResendWebhook(await resendWebhookRequest(body, 'msg_duplicate'), emailEnv(cache));
      const duplicate = await handleResendWebhook(await resendWebhookRequest(body, 'msg_duplicate'), emailEnv(cache));

      expect(first.status).toBe(200);
      await expect(duplicate.json()).resolves.toEqual({ ok: true, duplicate: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
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
        subject: '[Test] Codex Resets alert delivery / 提醒投递测试',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sends a bounded diagnostic email for a pipeline health failure', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'email_health' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await sendHealthAlert(emailEnv(), {
        startedAt: '2026-08-22T13:30:00.000Z',
        trigger: 'cron',
        scrape: 'failed',
        tweetsSeen: 0,
        candidates: 0,
        inserted: 0,
        notifiedEmails: 0,
        notifiedPush: 0,
        errors: ['scrape: all sources unavailable'],
      });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toMatchObject({
        to: ['ops@example.test'],
        subject: '[Action required] Codex Resets Worker health failed / 运行异常',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
