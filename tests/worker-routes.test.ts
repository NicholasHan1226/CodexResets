import { describe, expect, it, vi } from 'vitest';
import { handleConfirmEmail, handleHealth, handleHealthDetails, handleResendWebhook, handleSignals, handleSubscribeEmail, handleSubscribePush, handleTestEmail, handleUnsubscribeEmail, handleUnsubscribePush, handleXWebhook } from '../worker/src/routes';
import { isExpiredPushEndpoint, sendHealthAlert, sendPushSubscriptionTest } from '../worker/src/notify';
import { signToken } from '../worker/src/util';
import { getStatusEvidence } from '../worker/src/signals';
import { shouldSendHealthAlert } from '../worker/src/pipeline';
import { getForecastCalibration, recordForecastSnapshot } from '../worker/src/forecast';
import { refreshOfficialCodexDiscovery } from '../worker/src/discovery';
import { getSubscriptionQuality, getXWebhookQuality } from '../worker/src/operational-metrics';
import type { Env, RunReport } from '../worker/src/types';
import { detectResetEvents, detectResetRetractions, isRetractionForCandidate, isTimelyAutomatedCandidate, scrapeTweets } from '../worker/src/scrape';

function envWith(cacheEntries: Record<string, string | null>): Env {
  const rateLimiter = {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}')) as { limit?: number; windowSeconds?: number };
        const key = `test:rate-limit:${id}`;
        const now = Date.now();
        const existing = JSON.parse(cacheEntries[key] || 'null') as { startedAt: number; attempts: number } | null;
        const current = !existing || now - existing.startedAt >= (body.windowSeconds || 0) * 1000
          ? { startedAt: now, attempts: 0 }
          : existing;
        if (!body.limit || current.attempts >= body.limit) return new Response(JSON.stringify({ allowed: false }), { status: 429 });
        current.attempts += 1;
        cacheEntries[key] = JSON.stringify(current);
        return new Response(JSON.stringify({ allowed: true }));
      },
    }),
  };
  return {
    CACHE: {
      get: async (key: string) => cacheEntries[key] ?? null,
      put: async (key: string, value: string) => { cacheEntries[key] = value; },
      delete: async (key: string) => { delete cacheEntries[key]; },
      list: async ({ prefix }: { prefix: string }) => ({
        keys: Object.keys(cacheEntries).filter((key) => key.startsWith(prefix)).map((name) => ({ name })),
        list_complete: true,
      }),
    },
    RATE_LIMITER: rateLimiter,
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

async function xWebhookRequest(body: string, secret = 'x-consumer-test-secret'): Promise<Request> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return new Request('https://api.example.test/api/webhooks/x', {
    method: 'POST',
    headers: { 'x-twitter-webhooks-signature': `sha256=${Buffer.from(signature).toString('base64')}` },
    body,
  });
}

describe('pipeline read endpoints', () => {
  it('returns a cacheable signal snapshot with browser CORS enabled', async () => {
    const snapshot = JSON.stringify({ signals: [{ source: 'tibopost', sourceUrl: 'https://example.test/source' }], generatedAt: 123 });
    const response = await handleSignals(envWith({ 'signals:latest': snapshot }));

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    await expect(response.json()).resolves.toEqual({ signals: [{ source: 'tibopost' }], generatedAt: 123 });
  });

  it('returns 503 until the first signal snapshot exists', async () => {
    const response = await handleSignals(envWith({}));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'no snapshot yet' });
  });

  it('keeps public health to coarse pipeline freshness only', async () => {
    const now = new Date().toISOString();
    const response = await handleHealth(envWith({
      'health:last_run': JSON.stringify({ startedAt: now, scrape: 'ok', errors: [] }),
      'signals:latest': JSON.stringify({ generatedAt: Date.now() }),
    }));
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body).not.toHaveProperty('configured');
    expect(body).not.toHaveProperty('deliveryToday');
  });

  it('keeps source URLs and raw errors out of public health', async () => {
    const now = new Date().toISOString();
    const response = await handleHealth(envWith({
      'health:last_run': JSON.stringify({
        startedAt: now,
        scrape: 'failed',
        errors: ['scrape: https://mirror.example.test failed'],
        scrapeInstance: 'https://mirror.example.test',
        candidateSamples: [{ tier: 'strong', ts: now, link: 'https://x.example.test/post', text: 'private diagnostic' }],
      }),
      'signals:latest': JSON.stringify({ generatedAt: Date.now() }),
    }));
    const body = await response.json() as { lastRun: Record<string, unknown> };

    expect(body.lastRun).toMatchObject({ scrape: 'failed', errorCount: 1 });
    expect(body.lastRun).not.toHaveProperty('errors');
    expect(body.lastRun).not.toHaveProperty('scrapeInstance');
    expect(body.lastRun).not.toHaveProperty('candidateSamples');
    expect(body.lastRun).not.toHaveProperty('notificationsSent');
  });

  it('requires the private cron credential for detailed health diagnostics', async () => {
    const response = await handleHealthDetails(new Request('https://api.example.test/api/health/details'), emailEnv());
    expect(response.status).toBe(401);
  });

  it('answers X webhook CRC checks without exposing the consumer secret', async () => {
    const secret = 'x-consumer-test-secret';
    const response = await handleXWebhook(
      new Request('https://api.example.test/api/webhooks/x?crc_token=challenge-123'),
      new URL('https://api.example.test/api/webhooks/x?crc_token=challenge-123'),
      { ...envWith({}), X_CONSUMER_SECRET: secret },
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    const body = await response.json() as { response_token: string };
    expect(response.status).toBe(200);
    expect(body.response_token).toMatch(/^sha256=/);
    expect(body.response_token).not.toContain(secret);
  });

  it('rejects CRC values that could be replayed as a signed webhook body', async () => {
    const token = JSON.stringify({ data: { event_uuid: 'evt-forged', event_type: 'post.create' } });
    const response = await handleXWebhook(
      new Request(`https://api.example.test/api/webhooks/x?crc_token=${encodeURIComponent(token)}`),
      new URL(`https://api.example.test/api/webhooks/x?crc_token=${encodeURIComponent(token)}`),
      { ...envWith({}), X_CONSUMER_SECRET: 'x-consumer-test-secret' },
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid crc token' });
  });

  it('rejects unsigned X webhook deliveries and accepts safely ignored signed events', async () => {
    const secret = 'x-consumer-test-secret';
    const body = JSON.stringify({ data: { event_uuid: 'evt-1', event_type: 'profile.update.bio', payload: {} } });
    const env = { ...envWith({}), X_CONSUMER_SECRET: secret };
    const unsigned = await handleXWebhook(
      new Request('https://api.example.test/api/webhooks/x', { method: 'POST', body }),
      new URL('https://api.example.test/api/webhooks/x'), env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(unsigned.status).toBe(401);

    const signed = await handleXWebhook(
      await xWebhookRequest(body, secret),
      new URL('https://api.example.test/api/webhooks/x'), env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(signed.status).toBe(200);
    await expect(signed.json()).resolves.toEqual({ ok: true, ignored: true });
  });

  it('starts the existing pipeline in the background for a signed X post event', async () => {
    const secret = 'x-consumer-test-secret';
    const pending: Promise<unknown>[] = [];
    const waitUntil = vi.fn((promise: Promise<unknown>) => { pending.push(promise); });
    const fetchMock = vi.fn(async () => new Response('unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const body = JSON.stringify({
        data: {
          event_uuid: 'evt-post-1',
          event_type: 'post.create',
          payload: { id: 'post-1', text: 'Codex usage limits reset.', created_at: new Date().toISOString() },
        },
      });
      const cache: Record<string, string | null> = {};
      const response = await handleXWebhook(
        await xWebhookRequest(body, secret),
        new URL('https://api.example.test/api/webhooks/x'),
        { ...envWith(cache), X_CONSUMER_SECRET: secret, RSSHUB_INSTANCES: '', TARGET_ACCOUNT: 'thsottiaux' },
        { waitUntil } as unknown as ExecutionContext,
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(waitUntil).toHaveBeenCalledOnce();
      await Promise.all(pending);
      await expect(getXWebhookQuality(envWith(cache))).resolves.toMatchObject({ sampledEvents: 1, failed: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('ignores signed X post events outside the freshness window', async () => {
    const secret = 'x-consumer-test-secret';
    const waitUntil = vi.fn();
    const body = JSON.stringify({
      data: {
        event_uuid: 'evt-stale-1',
        event_type: 'post.create',
        payload: { id: 'post-stale', text: 'Codex usage limits reset.', created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() },
      },
    });
    const response = await handleXWebhook(
      await xWebhookRequest(body, secret),
      new URL('https://api.example.test/api/webhooks/x'),
      { ...envWith({}), X_CONSUMER_SECRET: secret },
      { waitUntil } as unknown as ExecutionContext,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: true });
    expect(waitUntil).toHaveBeenCalledOnce();
  });

  it('preserves full diagnostics only for the authorized operations path', async () => {
    const now = new Date().toISOString();
    const response = await handleHealthDetails(new Request('https://api.example.test/api/health/details', {
      headers: { authorization: 'Bearer cron-test-secret' },
    }), emailEnv({
      'health:last_run': JSON.stringify({ startedAt: now, scrape: 'failed', errors: ['scrape: internal detail'] }),
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ lastRun: { errors: ['scrape: internal detail'] } });
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

  it('keeps delivery roll-ups on the protected diagnostics endpoint', async () => {
    const now = new Date().toISOString();
    const date = now.slice(0, 10);
    const response = await handleHealth(envWith({
      'health:last_run': JSON.stringify({ startedAt: now, scrape: 'ok', errors: [] }),
      'signals:latest': JSON.stringify({ generatedAt: Date.now() }),
      [`metrics:delivery:${date}`]: JSON.stringify({ date, runs: 2, emails: 1, pushes: 0 }),
    }));
    const body = await response.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('deliveryToday');
  });

  it('classifies 404 and 410 push responses as safely removable endpoints', () => {
    expect(isExpiredPushEndpoint(404)).toBe(true);
    expect(isExpiredPushEndpoint(410)).toBe(true);
    expect(isExpiredPushEndpoint(503)).toBe(false);
  });

  it('skips an immediate Push test only when VAPID is intentionally unavailable', async () => {
    await expect(sendPushSubscriptionTest(envWith({}), {
      endpoint: 'https://push.example.test/subscription',
      p256dh: 'public-key',
      auth: 'auth-key',
    })).resolves.toBe('skipped');
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

  it('prefers the official X API timeline when its Worker secret is configured', async () => {
    const cache: Record<string, string | null> = {};
    const fetchMock = vi.fn(async (input: string) => {
      if (input.startsWith('https://api.x.com/2/users/by/username/')) {
        return new Response(JSON.stringify({ data: { id: '42' } }), { status: 200 });
      }
      if (input.startsWith('https://api.x.com/2/users/42/tweets')) {
        return new Response(JSON.stringify({
          data: [{ id: 'post-1', text: 'Codex usage limits were reset.', created_at: '2026-08-22T15:00:00.000Z' }],
        }), { status: 200 });
      }
      return new Response('unexpected source', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await scrapeTweets({
        ...envWith(cache),
        X_BEARER_TOKEN: 'x-api-test-token',
        TARGET_ACCOUNT: 'thsottiaux',
        RSSHUB_INSTANCES: '',
      });
      expect(result).toMatchObject({ ok: true, instance: 'x-api', sourceKind: 'direct' });
      expect(result.tweets[0]).toMatchObject({ link: 'https://x.com/thsottiaux/status/post-1' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('treats RSSHub content as degraded discovery even when it is available', async () => {
    const feed = `<?xml version="1.0"?><rss><channel><item>
      <title>Codex usage limits reset for subscribers</title>
      <link>https://x.com/thsottiaux/status/123</link>
      <pubDate>Sat, 22 Aug 2026 05:24:00 GMT</pubDate>
    </item></channel></rss>`;
    const fetchMock = vi.fn(async (input: string) => {
      if (input.startsWith('https://rss.example.test/')) return new Response(feed, { status: 200 });
      return new Response('unavailable', { status: 503 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await scrapeTweets({ ...envWith({}), RSSHUB_INSTANCES: 'https://rss.example.test', TARGET_ACCOUNT: 'thsottiaux' });
      expect(result).toMatchObject({ ok: true, instance: 'https://rss.example.test', sourceKind: 'degraded' });
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
      await expect(getSubscriptionQuality(emailEnv(cache))).resolves.toMatchObject({
        email: { confirmationSent: 1, confirmed: 0, confirmationRate: 0 },
      });
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

  it('rejects oversized public subscription bodies before provider calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleSubscribeEmail(new Request('https://api.example.test/api/subscribe/email', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.20' },
        body: JSON.stringify({ email: 'reader@example.test', turnstileToken: 'x'.repeat(9_000) }),
      }), emailEnv());
      expect(response.status).toBe(413);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects push registrations for arbitrary HTTPS hosts before storage or delivery', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleSubscribePush(new Request('https://api.example.test/api/subscribe/push', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.21' },
        body: JSON.stringify({ endpoint: 'https://attacker.example.test/push', keys: { p256dh: 'a'.repeat(88), auth: 'b'.repeat(24) } }),
      }), emailEnv());
      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('accepts a supported push authority without exposing storage internals', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleSubscribePush(new Request('https://api.example.test/api/subscribe/push', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.22' },
        body: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/fcm/send/device', keys: { p256dh: 'a'.repeat(88), auth: 'b'.repeat(24) } }),
      }), emailEnv());
      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('requires browser-held subscription keys before deleting a push endpoint', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/device';
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const missingProof = await handleUnsubscribePush(new Request('https://api.example.test/api/unsubscribe/push', {
        method: 'POST', body: JSON.stringify({ endpoint }),
      }), emailEnv());
      expect(missingProof.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();

      const auth = 'b'.repeat(24);
      const response = await handleUnsubscribePush(new Request('https://api.example.test/api/unsubscribe/push', {
        method: 'POST',
        body: JSON.stringify({ endpoint, keys: { p256dh: 'a'.repeat(88), auth } }),
      }), emailEnv());
      expect(response.status).toBe(200);
      expect(String(fetchMock.mock.calls[0][0])).toContain(`auth=eq.${auth}`);
      expect(String(fetchMock.mock.calls[0][0])).toContain(`p256dh=eq.${'a'.repeat(88)}`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('requires a fresh expiry-bound unsubscribe capability', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    const token = await signToken(`reader@example.test.${expiresAt}`, 'unsubscribe-test-secret');
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const valid = await handleUnsubscribeEmail(
        new URL(`https://api.example.test/api/unsubscribe?e=reader@example.test&x=${expiresAt}&t=${token}`),
        { ...emailEnv(), UNSUBSCRIBE_SECRET: 'unsubscribe-test-secret' },
      );
      expect(valid.status).toBe(200);
      const expired = await handleUnsubscribeEmail(
        new URL(`https://api.example.test/api/unsubscribe?e=reader@example.test&x=${expiresAt - 120}&t=${token}`),
        { ...emailEnv(), UNSUBSCRIBE_SECRET: 'unsubscribe-test-secret' },
      );
      expect(expired.status).toBe(400);
      expect(fetchMock).toHaveBeenCalledOnce();
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
      await expect(getSubscriptionQuality(emailEnv(cache))).resolves.toMatchObject({ email: { confirmed: 1 } });
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
      await expect(getSubscriptionQuality(emailEnv(cache))).resolves.toMatchObject({ email: { bounced: 1 } });
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

  it('rejects an oversized Resend body before signature or subscription work', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await handleResendWebhook(new Request('https://api.example.test/api/webhooks/resend', {
        method: 'POST',
        body: 'x'.repeat(300 * 1024),
      }), emailEnv());
      expect(response.status).toBe(413);
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

describe('forecast snapshot retention', () => {
  it('stores a daily forecast and resolves it automatically once its horizon closes', async () => {
    const cache: Record<string, string | null> = {};
    const now = Date.parse('2026-08-20T00:00:00Z');
    const rows = Array.from({ length: 6 }, (_, index) => ({
      id: `reset-${index}`,
      reset_date: new Date(now - (index + 1) * 4 * 24 * 60 * 60 * 1000).toISOString(),
      source_url: null,
      description: 'verified reset',
      verified: true,
      auto_state: 'confirmed' as const,
    }));
    const env = envWith(cache);

    await recordForecastSnapshot(env, rows, now);
    expect(JSON.parse(cache['forecast:latest'] || '{}')).toMatchObject({ model: expect.any(String), prob24h: expect.any(Number), prob48h: expect.any(Number) });

    await recordForecastSnapshot(env, [{
      ...rows[0], id: 'new-reset', reset_date: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
    }, ...rows], now + 49 * 60 * 60 * 1000);
    const evaluations = JSON.parse(cache['forecast:evaluations'] || '[]') as Array<{ resetIn24h: boolean; resetIn48h: boolean }>;
    expect(evaluations).toEqual(expect.arrayContaining([expect.objectContaining({ resetIn24h: true, resetIn48h: true })]));
    await expect(getForecastCalibration(env)).resolves.toMatchObject({
      samples: 1,
      brier24h: expect.any(Number),
      brier48h: expect.any(Number),
      latest: expect.objectContaining({ model: expect.any(String) }),
      stage: 'collecting',
      nextReviewAt: 7,
      decisionAccuracy48h: {
        threshold: 0.8,
        target: 0.8,
        status: 'collecting',
      },
    });
    const details = await handleHealthDetails(
      new Request('https://api.example.test/api/health/details', { headers: { authorization: 'Bearer calibration-test' } }),
      { ...env, CRON_SECRET: 'calibration-test' },
    );
    await expect(details.json()).resolves.toMatchObject({ forecastCalibration: { samples: 1 } });
  });
});

describe('official discovery isolation', () => {
  it('caches official update context without turning it into a reset candidate', async () => {
    const cache: Record<string, string | null> = {};
    const fetchMock = vi.fn().mockResolvedValue(new Response('<html><body>Codex usage limits and banked reset details</body></html>', {
      headers: { 'last-modified': 'Fri, 22 Aug 2026 12:00:00 GMT' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const first = await refreshOfficialCodexDiscovery(envWith(cache));
      const second = await refreshOfficialCodexDiscovery(envWith(cache));
      expect(first).toMatchObject({ reachable: true, resetContextFound: true });
      expect(second).toEqual(first);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
