import type { Env } from './types';
import { json, html, escapeHtml, verifyToken } from './util';
import { sbUpsert, sbDelete, sbUpdate } from './supabase';
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
  return json({
    ok: true,
    now: new Date().toISOString(),
    lastRun: lastRun ? JSON.parse(lastRun) : null,
    signalsGeneratedAt: signals ? JSON.parse(signals).generatedAt : null,
    configured: {
      serviceRole: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      resend: Boolean(env.RESEND_API_KEY),
      vapid: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
      unsubscribe: Boolean(env.UNSUBSCRIBE_SECRET),
    },
  });
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
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'server not configured (service role key missing)' }, 503);
  }
  const res = await sbUpsert(env, 'push_subscriptions', [
    {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: request.headers.get('user-agent')?.slice(0, 256) ?? null,
    },
  ]);
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
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'server not configured' }, 503);
  }
  await sbDelete(env, `push_subscriptions?endpoint=eq.${encodeURIComponent(body.endpoint)}`);
  return json({ ok: true });
}

/** GET /api/unsubscribe?e=...&t=... — HMAC-signed email unsubscribe (no login) */
export async function handleUnsubscribeEmail(url: URL, env: Env): Promise<Response> {
  const email = (url.searchParams.get('e') || '').toLowerCase().trim();
  const token = url.searchParams.get('t') || '';
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!validEmail || !token) return html(unsubPage('Invalid unsubscribe link.', false), 400);
  if (!env.UNSUBSCRIBE_SECRET || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return html(unsubPage('Server not configured.', false), 503);
  }
  const ok = await verifyToken(email, token, env.UNSUBSCRIBE_SECRET);
  if (!ok) return html(unsubPage('Invalid or expired unsubscribe link.', false), 403);

  await sbUpdate(env, `subscriptions?email=eq.${encodeURIComponent(email)}`, {
    is_active: false,
    unsubscribed_at: new Date().toISOString(),
  });
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
