import type { DeliveryMetrics, Env, HealthCheck, HealthChecks, RunReport } from './types';
import { json, html, escapeHtml, readJsonWithin as readResponseJsonWithin, timingSafeEqual, verifyToken } from './util';
import { hasPrivilegedAccess, privUpsertPush, privDeletePush, privDeleteEmail, privActivateEmail } from './privileged';
import { runPipeline } from './pipeline';
import { sendPushSubscriptionTest, sendSubscriptionConfirmation, sendTestEmail } from './notify';
import { FORECAST_RELEASE_STATUS_KEY, getForecastCalibration } from './forecast';
import { getOfficialCodexDiscovery } from './discovery';
import { getSubscriptionQuality, getXWebhookQuality, recordSubscriptionMetric, recordXWebhookOutcome } from './operational-metrics';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONFIRM_TTL_SECONDS = 24 * 60 * 60;
const REQUEST_COOLDOWN_SECONDS = 5 * 60;
const IP_RATE_WINDOW_SECONDS = 10 * 60;
const IP_RATE_LIMIT = 5;
const PUSH_RATE_LIMIT = 5;
const WEBHOOK_REPLAY_TTL_SECONDS = 7 * 24 * 60 * 60;
const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;
const X_WEBHOOK_MAX_BYTES = 256 * 1024;
const RESEND_WEBHOOK_MAX_BYTES = 256 * 1024;
const SUBSCRIPTION_BODY_MAX_BYTES = 8 * 1024;
const TURNSTILE_RESPONSE_MAX_BYTES = 8 * 1024;
const EXTERNAL_VERIFICATION_TIMEOUT_MS = 8_000;
const X_WEBHOOK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const UNSUBSCRIBE_MAX_FUTURE_SECONDS = 31 * 24 * 60 * 60;
const PUSH_ENDPOINT_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'wns.windows.com',
]);
const PIPELINE_SIGNAL_SOURCES = new Set(['tibopost', 'status_page', 'cooldown', 'launch_noise']);

type PublicSignalSnapshot = {
  source?: unknown;
  label?: unknown;
  status?: unknown;
  value?: unknown;
  description?: unknown;
  updatedAt?: unknown;
  scheduledAt?: unknown;
  sourceUrl?: unknown;
};

type StoredSignalSnapshot = {
  signals?: PublicSignalSnapshot[];
  generatedAt?: number;
  history?: Array<{ id?: unknown; reset_date?: unknown; verified?: unknown }>;
  sources?: unknown;
};

/** GET /api/signals — the snapshot the browser consumes */
export async function handleSignals(env: Env): Promise<Response> {
  const raw = await env.CACHE.get('signals:latest');
  if (!raw) return json({ error: 'no snapshot yet' }, 503);
  const snapshot = parseJson<StoredSignalSnapshot>(raw);
  if (!snapshot?.signals) return json({ error: 'no snapshot yet' }, 503);
  const snapshotCheck = signalSnapshotCheck(snapshot, Date.now());
  if (snapshotCheck === 'stale') return json({ error: 'signal snapshot stale' }, 503);
  if (snapshotCheck !== 'ok') return json({ error: 'signal snapshot invalid' }, 503);
  return json({
    generatedAt: snapshot.generatedAt,
    sources: snapshot.sources,
    signals: snapshot.signals.map((signal) => {
      const publicSignal = { ...signal };
      delete publicSignal.sourceUrl;
      if (typeof publicSignal.scheduledAt !== 'number' || !Number.isFinite(publicSignal.scheduledAt)) {
        delete publicSignal.scheduledAt;
      }
      return publicSignal;
    }),
    // Keep the browser prediction path self-contained without exposing
    // announcement text, source URLs, lifecycle state, or any subscriber data.
    history: (snapshot.history || []).flatMap((record) => (
      typeof record.id === 'string'
      && typeof record.reset_date === 'string'
      && record.verified === true
        ? [{ id: record.id, reset_date: record.reset_date, verified: true }]
        : []
    )).slice(0, 100),
  }, 200, {
    'cache-control': 'public, max-age=60',
    'access-control-allow-origin': '*',
  });
}

/** GET /api/health — last run report for ops/debug */
export async function handleHealth(env: Env): Promise<Response> {
  const lastRun = await env.CACHE.get('health:last_run');
  const signals = await env.CACHE.get('signals:latest');
  const report = parseJson<RunReport>(lastRun);
  const snapshot = parseJson<StoredSignalSnapshot>(signals);
  const checks = healthChecks(report, snapshot);
  const ok = checks.lastRun === 'ok' && checks.signals === 'ok';
  return json({
    ok,
    now: new Date().toISOString(),
    lastRun: publicRunReport(report),
    signalsGeneratedAt: snapshot?.generatedAt ?? null,
    checks,
  }, ok ? 200 : 503);
}

/** Public, binary release gate for automation. Calibration evidence stays private. */
export async function handleReleaseStatus(env: Env): Promise<Response> {
  return json({ ready: (await env.CACHE.get(FORECAST_RELEASE_STATUS_KEY)) === '1' });
}

/** Protected full diagnostics; public health deliberately exposes no source URLs or raw errors. */
export async function handleHealthDetails(request: Request, env: Env): Promise<Response> {
  if (!isCronAuthorized(request, env)) return json({ error: 'unauthorized' }, 401);
  const report = parseJson<RunReport>(await env.CACHE.get('health:last_run'));
  const date = new Date().toISOString().slice(0, 10);
  const deliveryToday = parseJson<DeliveryMetrics>(await env.CACHE.get(`metrics:delivery:${date}`));
  const [forecastCalibration, officialDiscovery, subscriptionQuality, xWebhookQuality] = await Promise.all([
    getForecastCalibration(env),
    getOfficialCodexDiscovery(env),
    getSubscriptionQuality(env),
    getXWebhookQuality(env),
  ]);
  return json({ now: new Date().toISOString(), lastRun: report, deliveryToday, forecastCalibration, officialDiscovery, subscriptionQuality, xWebhookQuality });
}

function publicRunReport(report: RunReport | null): Pick<RunReport, 'startedAt' | 'scrape'> & { errorCount: number } | null {
  if (!report) return null;
  return { startedAt: report.startedAt, scrape: report.scrape, errorCount: report.errors.length };
}

const HEALTH_STALE_MS = 90 * 60 * 1000;

function healthChecks(report: RunReport | null, snapshot: StoredSignalSnapshot | null): HealthChecks {
  const now = Date.now();
  return {
    lastRun: reportCheck(report, now),
    signals: snapshot ? signalSnapshotCheck(snapshot, now) : 'missing',
  };
}

/** Keep public API health aligned with the browser's LIVE acceptance contract. */
function signalSnapshotCheck(snapshot: StoredSignalSnapshot, now: number): HealthCheck {
  const freshness = timestampCheck(snapshot.generatedAt, now);
  if (freshness !== 'ok') return freshness;
  if (!Array.isArray(snapshot.signals) || snapshot.signals.length !== PIPELINE_SIGNAL_SOURCES.size) return 'failed';

  const seen = new Set<string>();
  for (const signal of snapshot.signals) {
    if (!signal
      || typeof signal.source !== 'string' || !PIPELINE_SIGNAL_SOURCES.has(signal.source) || seen.has(signal.source)
      || typeof signal.label !== 'string' || signal.label.length === 0
      || typeof signal.description !== 'string' || signal.description.length === 0
      || (signal.status !== 'active' && signal.status !== 'weak' && signal.status !== 'idle')
      || typeof signal.value !== 'number' || !Number.isFinite(signal.value) || signal.value < 0 || signal.value > 1
      || typeof signal.updatedAt !== 'number' || !Number.isFinite(signal.updatedAt) || signal.updatedAt > now + 5 * 60 * 1000) {
      return 'failed';
    }
    if (signal.scheduledAt !== undefined && (typeof signal.scheduledAt !== 'number' || !Number.isFinite(signal.scheduledAt))) {
      return 'failed';
    }
    seen.add(signal.source);
  }
  return seen.size === PIPELINE_SIGNAL_SOURCES.size ? 'ok' : 'failed';
}

function reportCheck(report: RunReport | null, now: number): HealthCheck {
  if (!report) return 'missing';
  if (report.scrape !== 'ok' || report.errors.length > 0) return 'failed';
  return timestampCheck(Date.parse(report.startedAt), now);
}

function timestampCheck(timestamp: number | undefined, now: number): HealthCheck {
  if (!timestamp || !Number.isFinite(timestamp)) return 'missing';
  return timestamp <= now + 5 * 60 * 1000 && now - timestamp <= HEALTH_STALE_MS ? 'ok' : 'stale';
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

interface PushSubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

/** POST /api/subscribe/push — store a browser push subscription */
export async function handleSubscribePush(request: Request, env: Env): Promise<Response> {
  const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!await allowRateLimitedRequest(env, 'push', clientIp, PUSH_RATE_LIMIT)) {
    return json({ error: 'too many push subscription attempts; try again later' }, 429);
  }
  const parsed = await readJsonWithin<PushSubscribeBody>(request, SUBSCRIPTION_BODY_MAX_BYTES);
  if (parsed === null) return json({ error: 'payload too large' }, 413);
  if (!parsed) return json({ error: 'invalid json' }, 400);
  const body = parsed;
  const { endpoint, keys } = body;
  if (!isAllowedPushEndpoint(endpoint)) {
    return json({ error: 'invalid endpoint' }, 400);
  }
  if (!keys?.p256dh || !keys?.auth || !isPushKey(keys.p256dh, 80, 256) || !isPushKey(keys.auth, 16, 64)) {
    return json({ error: 'missing keys' }, 400);
  }
  if (endpoint.length > 1024 || keys.p256dh.length > 256 || keys.auth.length > 64) {
    return json({ error: 'payload too large' }, 400);
  }
  if (!hasPrivilegedAccess(env)) {
    return json({ error: 'server not configured (no privileged DB access)' }, 503);
  }
  const subscription = {
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  };
  const res = await privUpsertPush(env, { ...subscription, user_agent: request.headers.get('user-agent')?.slice(0, 256) ?? null });
  if (!res.ok) return json({ error: 'subscription storage unavailable' }, 502);
  try {
    const result = await sendPushSubscriptionTest(env, subscription);
    if (result === 'gone') {
      await privDeletePush(env, endpoint);
      await recordSubscriptionMetric(env, 'push_expired_during_test').catch(() => {});
      return json({ error: 'push endpoint expired' }, 410);
    }
    await recordSubscriptionMetric(env, 'push_registered').catch(() => {});
    await recordSubscriptionMetric(env, result === 'sent' ? 'push_test_delivered' : 'push_test_skipped').catch(() => {});
  } catch {
    await privDeletePush(env, endpoint);
    return json({ error: 'push delivery test failed; retry subscription' }, 502);
  }
  return json({ ok: true });
}

/** POST /api/unsubscribe/push — remove a push subscription with its browser-held key proof. */
export async function handleUnsubscribePush(request: Request, env: Env): Promise<Response> {
  const parsed = await readJsonWithin<PushSubscribeBody>(request, SUBSCRIPTION_BODY_MAX_BYTES);
  if (parsed === null) return json({ error: 'payload too large' }, 413);
  if (!parsed) return json({ error: 'invalid json' }, 400);
  const body = parsed;
  const { endpoint, keys } = body;
  if (!isAllowedPushEndpoint(endpoint) || !keys?.p256dh || !keys?.auth
    || !isPushKey(keys.p256dh, 80, 256) || !isPushKey(keys.auth, 16, 64)) {
    return json({ error: 'invalid subscription proof' }, 400);
  }
  if (!hasPrivilegedAccess(env)) {
    return json({ error: 'server not configured' }, 503);
  }
  const result = await privDeletePush(env, endpoint, keys.auth, keys.p256dh);
  if (!result.ok) return json({ error: 'subscription storage unavailable' }, 502);
  await recordSubscriptionMetric(env, 'push_unsubscribed').catch(() => {});
  return json({ ok: true });
}

/** GET /api/unsubscribe?e=...&t=... — HMAC-signed email unsubscribe (no login) */
export async function handleUnsubscribeEmail(url: URL, env: Env): Promise<Response> {
  const email = (url.searchParams.get('e') || '').toLowerCase().trim();
  const token = url.searchParams.get('t') || '';
  const expiresAt = Number(url.searchParams.get('x'));
  const validEmail = EMAIL_RE.test(email);
  if (!validEmail || !token || !isValidUnsubscribeExpiry(expiresAt)) return html(unsubPage('Invalid or expired unsubscribe link.', false), 400);
  if (!env.UNSUBSCRIBE_SECRET || !hasPrivilegedAccess(env)) {
    return html(unsubPage('Server not configured.', false), 503);
  }
  const ok = await verifyToken(`${email}.${expiresAt}`, token, env.UNSUBSCRIBE_SECRET);
  if (!ok) return html(unsubPage('Invalid or expired unsubscribe link.', false), 403);

  const res = await privDeleteEmail(env, email);
  if (!res.ok) return html(unsubPage('We could not process this unsubscribe request. Please try again later.', false), 502);
  await recordSubscriptionMetric(env, 'email_unsubscribed').catch(() => {});
  return html(unsubPage(`<b>${escapeHtml(email)}</b> has been unsubscribed. You will no longer receive reset alerts.`, true));
}

/** POST /api/webhooks/resend — signed bounce and complaint suppression. */
export async function handleResendWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.RESEND_WEBHOOK_SECRET || !hasPrivilegedAccess(env)) return json({ error: 'webhook not configured' }, 503);
  const rawBytes = await readBodyWithin(request, RESEND_WEBHOOK_MAX_BYTES);
  if (!rawBytes) return json({ error: 'payload too large' }, 413);
  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(rawBytes);
  } catch {
    return json({ error: 'invalid webhook body' }, 400);
  }
  const id = request.headers.get('svix-id') || '';
  const timestamp = request.headers.get('svix-timestamp') || '';
  const signature = request.headers.get('svix-signature') || '';
  if (!await verifyResendWebhook(raw, id, timestamp, signature, env.RESEND_WEBHOOK_SECRET)) {
    return json({ error: 'invalid webhook signature' }, 401);
  }

  const replayKey = `resend:webhook:${id}`;
  if (await env.CACHE.get(replayKey)) return json({ ok: true, duplicate: true });
  let event: { type?: string; data?: { to?: unknown } };
  try {
    event = JSON.parse(raw) as { type?: string; data?: { to?: unknown } };
  } catch {
    return json({ error: 'invalid webhook body' }, 400);
  }
  if (event.type === 'email.bounced' || event.type === 'email.complained') {
    const recipients = Array.isArray(event.data?.to)
      ? event.data.to.filter((value): value is string => typeof value === 'string' && EMAIL_RE.test(value)).map((value) => value.toLowerCase())
      : [];
    for (const email of recipients) {
      const res = await privDeleteEmail(env, email);
      if (!res.ok) return json({ error: `subscription cleanup failed: ${res.status}` }, 502);
    }
    if (recipients.length > 0) {
      await recordSubscriptionMetric(env, event.type === 'email.bounced' ? 'email_bounced' : 'email_complained', recipients.length).catch(() => {});
    }
  }
  await env.CACHE.put(replayKey, '1', { expirationTtl: WEBHOOK_REPLAY_TTL_SECONDS });
  return json({ ok: true });
}

/**
 * X Activity webhook. GET completes X's recurring CRC ownership proof; POST
 * accepts only signed post.create events, then starts the existing pipeline in
 * the background. The pipeline still reads the official account timeline, so
 * a webhook is an acceleration signal rather than an unverified alert source.
 */
export async function handleXWebhook(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const secret = env.X_CONSUMER_SECRET;
  if (!secret) return json({ error: 'webhook not configured' }, 503);

  if (request.method === 'GET') {
    const token = url.searchParams.get('crc_token') || '';
    // CRC proves endpoint ownership, but it must not become an arbitrary-message
    // HMAC oracle for the POST signature. X issues URL-safe opaque tokens.
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(token)) return json({ error: 'invalid crc token' }, 400);
    return json({ response_token: `sha256=${await hmacBase64(secret, new TextEncoder().encode(token))}` });
  }

  const raw = await readBodyWithin(request, X_WEBHOOK_MAX_BYTES);
  if (!raw) return json({ error: 'payload too large' }, 413);
  const signature = request.headers.get('x-twitter-webhooks-signature') || '';
  if (!await verifyXWebhookSignature(raw, signature, secret)) return json({ error: 'invalid webhook signature' }, 401);

  let event: XActivityEvent;
  try {
    event = JSON.parse(new TextDecoder().decode(raw)) as XActivityEvent;
  } catch {
    return json({ error: 'invalid webhook body' }, 400);
  }
  const data = event.data;
  if (data?.event_type !== 'post.create' || !isXPost(data.payload) || !data.event_uuid) {
    ctx.waitUntil(recordXWebhookOutcome(env, 'ignored').catch(() => {}));
    return json({ ok: true, ignored: true });
  }
  if (!isFreshXPost(data.payload.created_at)) {
    ctx.waitUntil(recordXWebhookOutcome(env, 'ignored').catch(() => {}));
    return json({ ok: true, ignored: true });
  }

  const replayKey = `x:webhook:${data.event_uuid}`;
  if (await env.CACHE.get(replayKey)) {
    ctx.waitUntil(recordXWebhookOutcome(env, 'duplicate').catch(() => {}));
    return json({ ok: true, duplicate: true });
  }
  await env.CACHE.put(replayKey, '1', { expirationTtl: WEBHOOK_REPLAY_TTL_SECONDS });
  ctx.waitUntil(runXWebhookPipeline(env));
  return json({ ok: true });
}

interface XActivityEvent {
  data?: {
    event_uuid?: string;
    event_type?: string;
    payload?: XActivityPost;
  };
}

interface XActivityPost {
  id?: string;
  text?: string;
  created_at?: string;
}

function isXPost(payload: XActivityPost | undefined): payload is Required<XActivityPost> {
  if (!payload || typeof payload.id !== 'string' || typeof payload.text !== 'string' || typeof payload.created_at !== 'string') return false;
  return payload.id.length > 0 && payload.text.length > 0 && Number.isFinite(Date.parse(payload.created_at));
}

function isFreshXPost(createdAt: string): boolean {
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return false;
  const now = Date.now();
  return timestamp <= now + WEBHOOK_MAX_AGE_MS && now - timestamp <= X_WEBHOOK_MAX_AGE_MS;
}

/** POST /api/subscribe/email — begin a double opt-in email subscription. */
export async function handleSubscribeEmail(request: Request, env: Env): Promise<Response> {
  const parsed = await readJsonWithin<{ email?: string; turnstileToken?: string }>(request, SUBSCRIPTION_BODY_MAX_BYTES);
  if (parsed === null) return json({ error: 'payload too large' }, 413);
  if (!parsed) return json({ error: 'invalid json' }, 400);
  const body = parsed;
  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  if (!EMAIL_RE.test(email) || email.length > 320) return json({ error: 'invalid email' }, 400);
  if (!env.RESEND_API_KEY) return json({ error: 'email delivery is not configured' }, 503);
  if (!env.TURNSTILE_SECRET) return json({ error: 'subscription verification is not configured' }, 503);

  const clientIp = request.headers.get('cf-connecting-ip');
  if (!clientIp) return json({ error: 'client address unavailable' }, 400);
  if (!await allowRateLimitedRequest(env, 'email', clientIp, IP_RATE_LIMIT)) return json({ error: 'too many subscription attempts; try again later' }, 429);

  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken.trim() : '';
  if (!turnstileToken || turnstileToken.length > 4096) return json({ error: 'subscription verification required' }, 400);
  const turnstileOk = await verifyTurnstile(env, turnstileToken, clientIp);
  if (!turnstileOk) return json({ error: 'subscription verification failed' }, 403);
  const emailKey = await emailHash(email);
  const cooldownKey = `subscribe:cooldown:${emailKey}`;
  if (await env.CACHE.get(cooldownKey)) return json({ ok: true, status: 'pending' });

  const token = crypto.randomUUID();
  await env.CACHE.put(`subscribe:confirm:${token}`, JSON.stringify({ email }), { expirationTtl: CONFIRM_TTL_SECONDS });
  await env.CACHE.put(cooldownKey, '1', { expirationTtl: REQUEST_COOLDOWN_SECONDS });
  try {
    await sendSubscriptionConfirmation(env, email, token);
  } catch (err) {
    await env.CACHE.delete(`subscribe:confirm:${token}`);
    await env.CACHE.delete(cooldownKey);
    throw err;
  }
  await recordSubscriptionMetric(env, 'email_confirmation_sent').catch(() => {});
  return json({ ok: true, status: 'pending' });
}

/** GET /api/subscribe/confirm?t=... — activate a previously confirmed email. */
export async function handleConfirmEmail(url: URL, env: Env): Promise<Response> {
  const token = url.searchParams.get('t') || '';
  if (!/^[0-9a-f-]{36}$/i.test(token)) return html(confirmPage('Invalid or expired confirmation link.', false), 400);

  const key = `subscribe:confirm:${token}`;
  const pending = parseJson<{ email?: string }>(await env.CACHE.get(key));
  const email = pending?.email?.toLowerCase().trim() || '';
  if (!EMAIL_RE.test(email)) return html(confirmPage('This confirmation link has expired.', false), 410);

  if (!hasPrivilegedAccess(env)) return html(confirmPage('Server not configured.', false), 503);
  const res = await privActivateEmail(env, email);
  if (!res.ok) return html(confirmPage('We could not activate this subscription. Please try again later.', false), 502);
  await env.CACHE.delete(key);
  await recordSubscriptionMetric(env, 'email_confirmed').catch(() => {});
  return html(confirmPage('Subscription confirmed. You will receive reset alerts at this address.', true));
}

/** Preserve a signed webhook's receipt-to-pipeline outcome without retaining its payload. */
async function runXWebhookPipeline(env: Env): Promise<void> {
  try {
    const report = await runPipeline(env, 'x-webhook');
    await recordXWebhookOutcome(env, report.scrape === 'ok' && report.errors.length === 0 ? 'completed' : 'failed', report);
  } catch {
    await recordXWebhookOutcome(env, 'failed').catch(() => {});
  }
}

/** POST /api/test-email — protected single-recipient delivery exercise. */
export async function handleTestEmail(request: Request, env: Env): Promise<Response> {
  if (!isCronAuthorized(request, env)) return json({ error: 'unauthorized' }, 401);
  let body: { email?: string };
  try {
    body = await request.json() as { email?: string };
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  if (!EMAIL_RE.test(email) || email.length > 320) return json({ error: 'invalid email' }, 400);
  await sendTestEmail(env, email);
  return json({ ok: true });
}

function unsubPage(message: string, ok: boolean): string {
  return `<!doctype html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0b0c0f;color:#f0f2f5;font-family:-apple-system,'Segoe UI',Roboto,sans-serif">
  <div style="text-align:center;padding:24px">
    <p style="font-family:Menlo,monospace;color:${ok ? '#10a37f' : '#ef4444'};font-size:13px">❯ codex resets</p>
    <p style="font-size:16px;margin:12px 0 20px">${message}</p>
    <a href="https://codexresets.cc" style="color:#10a37f;font-size:13px;text-decoration:none">← Back to dashboard</a>
  </div></body></html>`;
}

function confirmPage(message: string, ok: boolean): string {
  return `<!doctype html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0b0c0f;color:#f0f2f5;font-family:-apple-system,'Segoe UI',Roboto,sans-serif">
  <div style="text-align:center;padding:24px">
    <p style="font-family:Menlo,monospace;color:${ok ? '#10a37f' : '#ef4444'};font-size:13px">❯ codex resets</p>
    <p style="font-size:16px;margin:12px 0 20px">${message}</p>
    <a href="https://codexresets.cc" style="color:#10a37f;font-size:13px;text-decoration:none">← Back to dashboard</a>
  </div></body></html>`;
}

async function emailHash(email: string): Promise<string> {
  return valueHash(email);
}

async function valueHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function allowRateLimitedRequest(env: Env, scope: string, clientIp: string, limit: number): Promise<boolean> {
  const ipKey = await valueHash(clientIp);
  try {
    const id = env.RATE_LIMITER.idFromName(`${scope}:${ipKey}`);
    const response = await env.RATE_LIMITER.get(id).fetch('https://rate-limit/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit, windowSeconds: IP_RATE_WINDOW_SECONDS }),
    });
    if (!response.ok) return false;
    return (await response.json() as { allowed?: unknown }).allowed === true;
  } catch {
    // Subscription intake fails closed if the coordination boundary is unavailable.
    return false;
  }
}

function isAllowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.port
      && PUSH_ENDPOINT_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isPushKey(value: unknown, minLength: number, maxLength: number): value is string {
  return typeof value === 'string'
    && value.length >= minLength
    && value.length <= maxLength
    && /^[A-Za-z0-9+/_-]+={0,2}$/.test(value);
}

function isValidUnsubscribeExpiry(expiresAt: number): boolean {
  if (!Number.isSafeInteger(expiresAt)) return false;
  const now = Math.floor(Date.now() / 1000);
  return expiresAt >= now && expiresAt <= now + UNSUBSCRIBE_MAX_FUTURE_SECONDS;
}

/** Validate the short-lived, single-use Turnstile token at the Worker boundary. */
async function verifyTurnstile(env: Env, token: string, clientIp: string): Promise<boolean> {
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET,
        response: token,
        remoteip: clientIp,
        idempotency_key: crypto.randomUUID(),
      }),
      signal: AbortSignal.timeout(EXTERNAL_VERIFICATION_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const result = await readResponseJsonWithin<{ success?: unknown; action?: unknown; hostname?: unknown }>(response, TURNSTILE_RESPONSE_MAX_BYTES);
    if (!result) return false;
    return result.success === true
      && result.action === 'subscribe_email'
      // The action prevents accidental reuse by another flow; the hostname
      // binds the public widget token to this dashboard even if its Cloudflare
      // site-key configuration is broadened by mistake.
      && result.hostname === turnstileHostname(env.SITE_URL);
  } catch {
    return false;
  }
}

function turnstileHostname(siteUrl: string): string | null {
  try {
    const url = new URL(siteUrl);
    return url.protocol === 'https:' ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Verify Resend/Svix HMAC over the raw body and reject stale replays. */
async function verifyResendWebhook(
  payload: string,
  id: string,
  timestamp: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const timestampMs = Number(timestamp) * 1000;
  if (!id || !Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > WEBHOOK_MAX_AGE_MS) return false;
  const encodedSecret = secret.replace(/^whsec_/, '');
  let keyBytes: Uint8Array;
  try {
    keyBytes = base64Bytes(encodedSecret);
  } catch {
    return false;
  }
  const signatures = signatureHeader.split(' ').flatMap((part) => {
    const [version, value] = part.split(',', 2);
    return version === 'v1' && value ? [value] : [];
  });
  if (signatures.length === 0) return false;
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const message = new TextEncoder().encode(`${id}.${timestamp}.${payload}`);
  for (const signature of signatures) {
    try {
      if (await crypto.subtle.verify('HMAC', key, base64Bytes(signature), message)) return true;
    } catch {
      // Try a rotated signature, if one was supplied.
    }
  }
  return false;
}

/** Verify the X HMAC header against the untouched request bytes. */
async function verifyXWebhookSignature(payload: Uint8Array, signature: string, secret: string): Promise<boolean> {
  if (!signature.startsWith('sha256=')) return false;
  let supplied: Uint8Array;
  try {
    supplied = base64Bytes(signature.slice('sha256='.length));
  } catch {
    return false;
  }
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('HMAC', key, supplied, payload);
  } catch {
    return false;
  }
}

async function hmacBase64(secret: string, message: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, message);
  let binary = '';
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Keep public webhook requests bounded before decoding or parsing them. */
async function readBodyWithin(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function readJsonWithin<T>(request: Request, maxBytes: number): Promise<T | undefined | null> {
  const raw = await readBodyWithin(request, maxBytes);
  if (!raw) return null;
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(raw)) as T;
  } catch {
    return undefined;
  }
}

function base64Bytes(value: string): Uint8Array {
  const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

function isCronAuthorized(request: Request, env: Env): boolean {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^bearer\s+/i, '');
  return Boolean(env.CRON_SECRET && timingSafeEqual(token, env.CRON_SECRET));
}

/** POST /api/run — manual trigger (protected by CRON_SECRET) */
export async function handleRun(request: Request, env: Env): Promise<Response> {
  if (!isCronAuthorized(request, env)) {
    return json({ error: 'unauthorized' }, 401);
  }
  const report = await runPipeline(env, 'manual');
  return json(report);
}
