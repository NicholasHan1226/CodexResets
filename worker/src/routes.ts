import type { Env, HealthCheck, HealthChecks, RunReport } from './types';
import { json, html, escapeHtml, verifyToken } from './util';
import { hasPrivilegedAccess, privUpsertPush, privDeletePush, privDeactivateEmail } from './privileged';
import { runPipeline } from './pipeline';

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
      pipelineSecret: Boolean(env.PIPELINE_SECRET),
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
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!validEmail || !token) return html(unsubPage('Invalid unsubscribe link.', false), 400);
  if (!env.UNSUBSCRIBE_SECRET || !hasPrivilegedAccess(env)) {
    return html(unsubPage('Server not configured.', false), 503);
  }
  const ok = await verifyToken(email, token, env.UNSUBSCRIBE_SECRET);
  if (!ok) return html(unsubPage('Invalid or expired unsubscribe link.', false), 403);

  await privDeactivateEmail(env, email);
  return html(unsubPage(`<b>${escapeHtml(email)}</b> has been unsubscribed. You will no longer receive reset alerts.`, true));
}

function unsubPage(message: string, ok: boolean): string {
  return `<!doctype html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0b0c0f;color:#f0f2f5;font-family:-apple-system,'Segoe UI',Roboto,sans-serif">
  <div style="text-align:center;padding:24px">
    <p style="font-family:Menlo,monospace;color:${ok ? '#10a37f' : '#ef4444'};font-size:13px">❯ codex resets</p>
    <p style="font-size:16px;margin:12px 0 20px">${message}</p>
    <a href="https://codexresets.cc" style="color:#10a37f;font-size:13px;text-decoration:none">← Back to dashboard</a>
  </div></body></html>`;
}

/** POST /api/run — manual trigger (protected by CRON_SECRET) */
export async function handleRun(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^bearer\s+/i, '');
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }
  const report = await runPipeline(env, 'manual');
  return json(report);
}
