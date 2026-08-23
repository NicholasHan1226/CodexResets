import { buildPushPayload, type PushMessage, type PushSubscription, type VapidKeys } from '@block65/webcrypto-web-push';
import type { Env, ResetEvent, RunReport } from './types';
import type { ForecastCalibration } from './forecast';
import { hasPrivilegedAccess, privListEmails, privListPush, privDeletePush, type PushSubRow } from './privileged';
import { signToken, escapeHtml } from './util';

const UNSUBSCRIBE_TTL_SECONDS = 30 * 24 * 60 * 60;
const OUTBOUND_TIMEOUT_MS = 8_000;
const DELIVERY_CONCURRENCY = 10;

interface SubscriptionRow {
  email: string;
}

export interface NotifyResult {
  emails: number;
  pushes: number;
  prunedPushEndpoints: number;
  errors: string[];
}

export function isExpiredPushEndpoint(status: number): boolean {
  return status === 404 || status === 410;
}

async function settleInBatches<T, R>(items: T[], task: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let start = 0; start < items.length; start += DELIVERY_CONCURRENCY) {
    results.push(...await Promise.allSettled(items.slice(start, start + DELIVERY_CONCURRENCY).map(task)));
  }
  return results;
}

/** Immediately proves a new browser endpoint can receive an encrypted push. */
export async function sendPushSubscriptionTest(env: Env, row: PushSubRow): Promise<'sent' | 'gone' | 'skipped'> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 'skipped';
  const vapid: VapidKeys = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const subscription: PushSubscription = {
    endpoint: row.endpoint,
    expirationTime: null,
    keys: { p256dh: row.p256dh, auth: row.auth },
  };
  const payload = await buildPushPayload({
    data: JSON.stringify({
      title: 'Codex Resets ready',
      body: 'Browser alerts are enabled. / 浏览器提醒已开启。',
      url: '/',
    }),
    options: { ttl: 60 },
  }, subscription, vapid);
  const res = await fetch(subscription.endpoint, { ...payload, redirect: 'error', signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS) });
  if (isExpiredPushEndpoint(res.status)) return 'gone';
  if (!res.ok) throw new Error(`push endpoint ${res.status}`);
  return 'sent';
}

/** Fan out a freshly detected reset to every subscriber (email + web push) */
export async function notifyAll(env: Env, event: ResetEvent): Promise<NotifyResult> {
  const errors: string[] = [];
  if (!hasPrivilegedAccess(env)) {
    return { emails: 0, pushes: 0, prunedPushEndpoints: 0, errors: ['notify skipped: no privileged DB access'] };
  }

  let emails: SubscriptionRow[] = [];
  let pushes: PushSubRow[] = [];
  try {
    emails = await privListEmails(env);
  } catch (err) {
    errors.push(`fetch emails: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    pushes = await privListPush(env);
  } catch (err) {
    errors.push(`fetch pushes: ${err instanceof Error ? err.message : String(err)}`);
  }

  const emailResults = await settleInBatches(emails, (row) => sendEmail(env, row.email, event));
  const sentEmails = emailResults.filter((r) => r.status === 'fulfilled' && r.value).length;
  for (const r of emailResults) {
    if (r.status === 'rejected') errors.push(`email: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  }

  const pushResults = await settleInBatches(pushes, (row) => sendPush(env, row, event));
  let sentPushes = 0;
  let prunedPushEndpoints = 0;
  for (let i = 0; i < pushResults.length; i++) {
    const r = pushResults[i];
    if (r.status === 'fulfilled') {
      if (r.value === 'gone') {
        // Endpoint is dead — prune it so the list stays clean
        await privDeletePush(env, pushes[i].endpoint).catch(() => {});
        prunedPushEndpoints++;
      } else if (r.value === 'sent') {
        sentPushes++;
      }
    } else {
      errors.push(`push: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  }

  return { emails: sentEmails, pushes: sentPushes, prunedPushEndpoints, errors };
}

// --- Email (Resend HTTPS API) ----------------------------------------------

async function sendEmail(env: Env, email: string, event: ResetEvent): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  const expiresAt = Math.floor(Date.now() / 1000) + UNSUBSCRIBE_TTL_SECONDS;
  const token = env.UNSUBSCRIBE_SECRET ? await signToken(`${email.toLowerCase()}.${expiresAt}`, env.UNSUBSCRIBE_SECRET) : '';
  const unsubUrl = `${workerBase(env)}/api/unsubscribe?e=${encodeURIComponent(email.toLowerCase())}&x=${expiresAt}&t=${token}`;
  const resetLocal = new Date(event.ts).toUTCString();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [email],
      subject: 'Codex usage limits were reset / Codex 使用额度已重置',
      headers: { 'List-Unsubscribe': `<${unsubUrl}>` },
      html: emailHtml(env, resetLocal, unsubUrl),
    }),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
  return true;
}

/** Send an explicit opt-in confirmation before an address enters the alert list. */
export async function sendSubscriptionConfirmation(env: Env, email: string, token: string): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
  const confirmUrl = `${workerBase(env)}/api/subscribe/confirm?t=${encodeURIComponent(token)}`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [email],
      subject: 'Confirm Codex Resets subscription / 确认 Codex 重置提醒订阅',
      html: confirmationHtml(confirmUrl),
    }),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
}

/** Admin-only delivery exercise; it never reads subscribers or runs the pipeline. */
export async function sendTestEmail(env: Env, email: string): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [email],
      subject: '[Test] Codex Resets alert delivery / 提醒投递测试',
      html: testEmailHtml(env),
    }),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
}

/** Send an operations alert; callers are responsible for rate limiting. */
export async function sendHealthAlert(env: Env, report: RunReport): Promise<void> {
  if (!env.RESEND_API_KEY || !env.HEALTH_ALERT_EMAIL) return;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [env.HEALTH_ALERT_EMAIL],
      subject: '[Action required] Codex Resets Worker health failed / 运行异常',
      html: healthAlertHtml(env, report),
    }),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
}

/** A sparse operational review notice; model selection itself stays deterministic and automatic. */
export async function sendCalibrationAlert(env: Env, calibration: ForecastCalibration): Promise<void> {
  if (!env.RESEND_API_KEY || !env.HEALTH_ALERT_EMAIL) return;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [env.HEALTH_ALERT_EMAIL],
      subject: '[Review] Codex Resets forecast calibration / 预测校准复核',
      html: calibrationAlertHtml(env, calibration),
    }),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
}

function emailHtml(env: Env, resetLocal: string, unsubUrl: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f8;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#16171c">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e6ea;border-radius:8px;padding:24px">
    <p style="margin:0 0 4px;font-family:'SF Mono',Menlo,monospace;font-size:12px;color:#10a37f">❯ codex resets</p>
    <h1 style="margin:0 0 12px;font-size:20px">Usage limits were reset / 使用额度已重置</h1>
    <p style="margin:0 0 12px;font-size:14px;color:#3d4250">A confirmed Codex reset is available. / 已确认 Codex 使用额度重置。</p>
    <p style="margin:0 0 16px;font-family:Menlo,monospace;font-size:12px;color:#7c8494">${escapeHtml(resetLocal)}</p>
    <a href="${env.SITE_URL}" style="display:inline-block;background:#10a37f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:6px">Open dashboard</a>
    <hr style="margin:20px 0 12px;border:none;border-top:1px solid #e4e6ea" />
    <p style="margin:0;font-size:11px;color:#9aa0ac">You subscribed at codexresets.cc · <a href="${unsubUrl}" style="color:#9aa0ac">Unsubscribe / 退订</a></p>
  </div>
</body></html>`;
}

function confirmationHtml(confirmUrl: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f8;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#16171c">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e6ea;border-radius:8px;padding:24px">
    <p style="margin:0 0 4px;font-family:'SF Mono',Menlo,monospace;font-size:12px;color:#10a37f">❯ codex resets</p>
    <h1 style="margin:0 0 12px;font-size:20px">Confirm your subscription / 确认订阅</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#3d4250">Confirm this address to receive Codex reset alerts. If you did not request this, ignore this email. / 确认后即可接收 Codex 重置提醒；若非本人操作，请忽略。</p>
    <a href="${confirmUrl}" style="display:inline-block;background:#10a37f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:6px">Confirm subscription / 确认订阅</a>
    <p style="margin:20px 0 0;font-size:11px;color:#9aa0ac">This confirmation link expires in 24 hours. / 链接 24 小时内有效。</p>
  </div>
</body></html>`;
}

function testEmailHtml(env: Env): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f8;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#16171c">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e6ea;border-radius:8px;padding:24px">
    <p style="margin:0 0 4px;font-family:'SF Mono',Menlo,monospace;font-size:12px;color:#10a37f">❯ codex resets</p>
    <h1 style="margin:0 0 12px;font-size:20px">Test alert delivery / 提醒投递测试</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#3d4250">This test does not indicate a Codex reset and does not change your subscription. / 这是一封测试邮件，不表示发生重置，也不会修改你的订阅。</p>
    <a href="${env.SITE_URL}" style="display:inline-block;background:#10a37f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:6px">Open dashboard</a>
  </div>
</body></html>`;
}

function healthAlertHtml(env: Env, report: RunReport): string {
  const errors = report.errors.length > 0 ? report.errors.slice(0, 3).join('\n') : 'No diagnostic details were recorded.';
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f8;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#16171c">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e6ea;border-radius:8px;padding:24px">
    <p style="margin:0 0 4px;font-family:'SF Mono',Menlo,monospace;font-size:12px;color:#d97706">! codex resets operations</p>
    <h1 style="margin:0 0 12px;font-size:20px">Worker health check failed</h1>
    <p style="margin:0 0 12px;font-size:14px;color:#3d4250">The scheduled pipeline run at ${escapeHtml(report.startedAt)} finished with status <strong>${escapeHtml(report.scrape)}</strong>.</p>
    <pre style="white-space:pre-wrap;margin:0 0 16px;padding:12px;background:#f8fafc;border:1px solid #e4e6ea;font-size:12px;color:#3d4250">${escapeHtml(errors)}</pre>
    <a href="${workerBase(env)}/api/health" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:6px">Open health report</a>
    <p style="margin:16px 0 0;font-size:11px;color:#9aa0ac">At most one health-failure alert is sent every six hours.</p>
  </div>
</body></html>`;
}

function calibrationAlertHtml(env: Env, calibration: ForecastCalibration): string {
  const score = calibration.recentBrier === null ? 'not enough samples' : calibration.recentBrier.toFixed(3);
  const accuracy = calibration.decisionAccuracy48h.accuracy === null
    ? 'not enough high-confidence decisions'
    : `${Math.round(calibration.decisionAccuracy48h.accuracy * 100)}%`;
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f8;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#16171c">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e6ea;border-radius:8px;padding:24px">
    <p style="margin:0 0 4px;font-family:'SF Mono',Menlo,monospace;font-size:12px;color:#2563eb">i codex resets operations</p>
    <h1 style="margin:0 0 12px;font-size:20px">Forecast calibration review</h1>
    <p style="margin:0 0 12px;font-size:14px;color:#3d4250">Private calibration reached <strong>${escapeHtml(calibration.stage)}</strong> with ${calibration.samples} resolved samples. Recent combined Brier score: ${escapeHtml(score)}; trend: ${escapeHtml(calibration.trend)}. High-confidence 48h decision accuracy: ${escapeHtml(accuracy)}.</p>
    <p style="margin:0 0 16px;font-size:13px;color:#667085">The public model continues its time-ordered automatic selection. This notice records a review threshold; it does not change subscriber delivery.</p>
    <a href="${workerBase(env)}/api/health" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:6px">Open health report</a>
  </div>
</body></html>`;
}

// --- Web Push (VAPID + aes128gcm via Web Crypto) ----------------------------

async function sendPush(env: Env, row: PushSubRow, event: ResetEvent): Promise<'sent' | 'gone' | 'skipped'> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 'skipped';

  const vapid: VapidKeys = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const subscription: PushSubscription = {
    endpoint: row.endpoint,
    expirationTime: null,
    keys: { p256dh: row.p256dh, auth: row.auth },
  };
  const message: PushMessage = {
    data: JSON.stringify({
      title: 'Codex Reset Alert',
      body: event.text
        ? `Usage limits were reset — "${event.text.slice(0, 120)}${event.text.length > 120 ? '…' : ''}"`
        : 'Usage limits were reset — quotas are fresh again.',
      url: '/',
    }),
    options: { ttl: 86400 },
  };

  const payload = await buildPushPayload(message, subscription, vapid);
  const res = await fetch(subscription.endpoint, { ...payload, redirect: 'error', signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS) });
  if (isExpiredPushEndpoint(res.status)) return 'gone';
  if (!res.ok) throw new Error(`push endpoint ${res.status}`);
  return 'sent';
}

function workerBase(env: Env): string {
  // PUBLIC_URL is set after the first deploy (workers.dev subdomain)
  return (env as Env & { PUBLIC_URL?: string }).PUBLIC_URL || env.SITE_URL;
}
