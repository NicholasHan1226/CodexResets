import type { Env, HealthCheck, HealthChecks, RunReport } from './types';
import { json, html, escapeHtml, verifyToken } from './util';
import { hasPrivilegedAccess, privUpsertPush, privDeletePush, privDeactivateEmail, privActivateEmail } from './privileged';
import { runPipeline } from './pipeline';
import { sendSubscriptionConfirmation, sendTestEmail } from './notify';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONFIRM_TTL_SECONDS = 24 * 60 * 60;
const REQUEST_COOLDOWN_SECONDS = 5 * 60;
const IP_RATE_WINDOW_SECONDS = 10 * 60;
const IP_RATE_LIMIT = 5;

/** GET /api/signals — the snapshot the browser consumes */
export async function handleSignals(env: Env): Promise<Response> {
  const raw = await env.CACHE.get('signals:latest');
  if (!raw) return json({ error: 'no snapshot yet' }, 503);
  return new Response(raw, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'access-control-allow-origin': '*',
    },
  });
}

/** GET /api/health — last run report for ops/debug */
export async function handleHealth(env: Env): Promise<Response> {
  const lastRun = await env.CACHE.get('health:last_run');
  const signals = await env.CACHE.get('signals:latest');
  const report = parseJson<RunReport>(lastRun);
  const snapshot = parseJson<{ generatedAt?: number }>(signals);
  const checks = healthChecks(report, snapshot?.generatedAt);
  const ok = checks.lastRun === 'ok' && checks.signals === 'ok';
  return json({
    ok,
    now: new Date().toISOString(),
    lastRun: report,
    signalsGeneratedAt: snapshot?.generatedAt ?? null,
    checks,
    configured: {
      serviceRole: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      resend: Boolean(env.RESEND_API_KEY),
      vapid: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
      unsubscribe: Boolean(env.UNSUBSCRIBE_SECRET),
    },
  }, ok ? 200 : 503);
}

const HEALTH_STALE_MS = 90 * 60 * 1000;

function healthChecks(report: RunReport | null, signalsGeneratedAt: number | undefined): HealthChecks {
  const now = Date.now();
  return {
    lastRun: reportCheck(report, now),
    signals: timestampCheck(signalsGeneratedAt, now),
  };
}

function reportCheck(report: RunReport | null, now: number): HealthCheck {
  if (!report) return 'missing';
  if (report.scrape !== 'ok' || report.errors.length > 0) return 'failed';
  return timestampCheck(Date.parse(report.startedAt), now);
}

function timestampCheck(timestamp: number | undefined, now: number): HealthCheck {
  if (!timestamp || !Number.isFinite(timestamp)) return 'missing';
  return now - timestamp <= HEALTH_STALE_MS ? 'ok' : 'stale';
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
  let body: PushSubscribeBody;
  try {
    body = (await request.json()) as PushSubscribeBody;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const { endpoint, keys } = body;
  if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
    return json({ error: 'invalid endpoint' }, 400);
  }
  if (!keys?.p256dh || !keys?.auth) {
    return json({ error: 'missing keys' }, 400);
  }
  if (endpoint.length > 1024 || keys.p256dh.length > 256 || keys.auth.length > 64) {
    return json({ error: 'payload too large' }, 400);
  }
  if (!hasPrivilegedAccess(env)) {
    return json({ error: 'server not configured (no privileged DB access)' }, 503);
  }
  const res = await privUpsertPush(env, {
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: request.headers.get('user-agent')?.slice(0, 256) ?? null,
  });
  if (!res.ok) return json({ error: `db: ${res.status} ${await res.text()}` }, 502);
  return json({ ok: true });
}

/** POST /api/unsubscribe/push — remove a push subscription by endpoint */
export async function handleUnsubscribePush(request: Request, env: Env): Promise<Response> {
  let body: { endpoint?: string };
  try {
    body = (await request.json()) as { endpoint?: string };
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  if (!body.endpoint || typeof body.endpoint !== 'string') {
    return json({ error: 'missing endpoint' }, 400);
  }
  if (!hasPrivilegedAccess(env)) {
    return json({ error: 'server not configured' }, 503);
  }
  await privDeletePush(env, body.endpoint);
  return json({ ok: true });
}

/** GET /api/unsubscribe?e=...&t=... — HMAC-signed email unsubscribe (no login) */
export async function handleUnsubscribeEmail(url: URL, env: Env): Promise<Response> {
  const email = (url.searchParams.get('e') || '').toLowerCase().trim();
  const token = url.searchParams.get('t') || '';
  const validEmail = EMAIL_RE.test(email);
  if (!validEmail || !token) return html(unsubPage('Invalid unsubscribe link.', false), 400);
  if (!env.UNSUBSCRIBE_SECRET || !hasPrivilegedAccess(env)) {
    return html(unsubPage('Server not configured.', false), 503);
  }
  const ok = await verifyToken(email, token, env.UNSUBSCRIBE_SECRET);
  if (!ok) return html(unsubPage('Invalid or expired unsubscribe link.', false), 403);

  await privDeactivateEmail(env, email);
  return html(unsubPage(`<b>${escapeHtml(email)}</b> has been unsubscribed. You will no longer receive reset alerts.`, true));
}

/** POST /api/subscribe/email — begin a double opt-in email subscription. */
export async function handleSubscribeEmail(request: Request, env: Env): Promise<Response> {
  let body: { email?: string; turnstileToken?: string };
  try {
    body = await request.json() as { email?: string; turnstileToken?: string };
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  if (!EMAIL_RE.test(email) || email.length > 320) return json({ error: 'invalid email' }, 400);
  if (!env.RESEND_API_KEY) return json({ error: 'email delivery is not configured' }, 503);
  if (!env.TURNSTILE_SECRET) return json({ error: 'subscription verification is not configured' }, 503);

  const clientIp = request.headers.get('cf-connecting-ip');
  if (!clientIp) return json({ error: 'client address unavailable' }, 400);
  const ipKey = await valueHash(clientIp);
  const rateLimitKey = `subscribe:ip:${ipKey}`;
  const attempts = Number.parseInt((await env.CACHE.get(rateLimitKey)) || '0', 10) || 0;
  if (attempts >= IP_RATE_LIMIT) return json({ error: 'too many subscription attempts; try again later' }, 429);
  await env.CACHE.put(rateLimitKey, String(attempts + 1), { expirationTtl: IP_RATE_WINDOW_SECONDS });

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
  return html(confirmPage('Subscription confirmed. You will receive reset alerts at this address.', true));
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
    });
    if (!response.ok) return false;
    const result = await response.json() as { success?: boolean; action?: string };
    return result.success === true && result.action === 'subscribe_email';
  } catch {
    return false;
  }
}

function isCronAuthorized(request: Request, env: Env): boolean {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^bearer\s+/i, '');
  return Boolean(env.CRON_SECRET && token === env.CRON_SECRET);
}

/** POST /api/run — manual trigger (protected by CRON_SECRET) */
export async function handleRun(request: Request, env: Env): Promise<Response> {
  if (!isCronAuthorized(request, env)) {
    return json({ error: 'unauthorized' }, 401);
  }
  const report = await runPipeline(env, 'manual');
  return json(report);
}
