import { buildPushPayload, type PushMessage, type PushSubscription, type VapidKeys } from '@block65/webcrypto-web-push';
import type { DeliveryLedger, Env, ResetEvent, RunReport } from './types';
import type { ForecastCalibration } from './forecast';
import { hasPrivilegedAccess, privListEmails, privListPush, privDeletePush, type PushSubRow } from './privileged';
import { signToken, readTextWithin } from './util';
import { classifyResetNotification, type ResetNotificationType } from './scrape';

import { renderEmail, type EmailContent } from './email-template';

const UNSUBSCRIBE_TTL_SECONDS = 30 * 24 * 60 * 60;
const OUTBOUND_TIMEOUT_MS = 8_000;
const DELIVERY_CONCURRENCY = 10;
const MAX_DELIVERIES_PER_CHANNEL_RUN = 50;
const PROVIDER_ERROR_MAX_BYTES = 8 * 1024;

interface SubscriptionRow {
  email: string;
}

export interface NotifyResult {
  emails: number;
  pushes: number;
  prunedPushEndpoints: number;
  errors: string[];
  /** More recipients remain and will continue automatically on the next run. */
  pending: boolean;
}

interface ResetNotificationDetails {
  type: ResetNotificationType;
  labelEn: string;
  labelZh: string;
  evidenceUrl: string | null;
  evidenceExcerpt: string | null;
}

/** A forecast email is deliberately distinct from a confirmed-reset alert. */
export interface ForecastPrealert {
  /** Stable for one reset cycle, so a threshold crossing can only alert once. */
  id: string;
  evaluatedAt: number;
  modelProbability: number;
  planningProbability: number;
  /** Included only when the current 24-hour forecast has direct official support. */
  officialEvidenceUrl: string | null;
}

/** A due-time notice is evidence-led but remains distinct from confirmation. */
export interface ScheduledExecutionNotice {
  /** Stable per official schedule, preventing repeat notices on later cron runs. */
  id: string;
  scheduledAt: number;
  officialEvidenceUrl: string | null;
  /** Aggregated only; no community posts, people, or links are exposed. */
  communityCorroborated?: boolean;
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
export async function notifyAll(env: Env, event: ResetEvent & { id: string }, deliveryLedger?: DeliveryLedger): Promise<NotifyResult> {
  const errors: string[] = [];
  if (!hasPrivilegedAccess(env)) {
    return { emails: 0, pushes: 0, prunedPushEndpoints: 0, errors: ['notify skipped: no privileged DB access'], pending: false };
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

  const emailCandidates = await pendingRecipients(emails, 'email', event.id, (row) => row.email, deliveryLedger);
  const emailBatch = emailCandidates.slice(0, MAX_DELIVERIES_PER_CHANNEL_RUN);
  const emailResults = await settleInBatches(emailBatch, (candidate) => sendEmail(env, candidate.row.email, event));
  const sentEmails = emailResults.filter((r) => r.status === 'fulfilled' && r.value).length;
  for (let index = 0; index < emailResults.length; index++) {
    const r = emailResults[index];
    if (r.status === 'fulfilled' && r.value && deliveryLedger) {
      await deliveryLedger.markDelivered(event.id, 'email', emailBatch[index].recipient);
    }
    if (r.status === 'rejected') errors.push(`email: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  }

  const pushCandidates = await pendingRecipients(pushes, 'push', event.id, (row) => row.endpoint, deliveryLedger);
  const pushBatch = pushCandidates.slice(0, MAX_DELIVERIES_PER_CHANNEL_RUN);
  const pushResults = await settleInBatches(pushBatch, (candidate) => sendPush(env, candidate.row, event));
  let sentPushes = 0;
  let prunedPushEndpoints = 0;
  for (let i = 0; i < pushResults.length; i++) {
    const r = pushResults[i];
    if (r.status === 'fulfilled') {
      if (r.value === 'gone') {
        // Endpoint is dead — prune it so the list stays clean
        await privDeletePush(env, pushBatch[i].row.endpoint).catch(() => {});
        if (deliveryLedger) await deliveryLedger.markDelivered(event.id, 'push', pushBatch[i].recipient);
        prunedPushEndpoints++;
      } else if (r.value === 'sent') {
        if (deliveryLedger) await deliveryLedger.markDelivered(event.id, 'push', pushBatch[i].recipient);
        sentPushes++;
      }
    } else {
      errors.push(`push: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  }

  return {
    emails: sentEmails,
    pushes: sentPushes,
    prunedPushEndpoints,
    errors,
    pending: emailCandidates.length > emailBatch.length || pushCandidates.length > pushBatch.length,
  };
}

/**
 * Send the one optional, email-only forecast notice for a reset cycle. Push
 * stays reserved for confirmed resets, so a browser permission never creates
 * a second noisy pre-alert channel.
 */
export async function notifyForecastPrealert(
  env: Env,
  prealert: ForecastPrealert,
  deliveryLedger?: DeliveryLedger,
): Promise<Pick<NotifyResult, 'emails' | 'errors' | 'pending'>> {
  const errors: string[] = [];
  if (!hasPrivilegedAccess(env)) {
    return { emails: 0, errors: ['forecast pre-alert skipped: no privileged DB access'], pending: false };
  }

  let emails: SubscriptionRow[] = [];
  try {
    emails = await privListEmails(env);
  } catch (err) {
    errors.push(`fetch emails: ${err instanceof Error ? err.message : String(err)}`);
  }

  const safePrealert: ForecastPrealert = {
    ...prealert,
    officialEvidenceUrl: officialEvidenceUrl(prealert.officialEvidenceUrl || ''),
  };
  const emailCandidates = await pendingRecipients(emails, 'email', safePrealert.id, (row) => row.email, deliveryLedger);
  const emailBatch = emailCandidates.slice(0, MAX_DELIVERIES_PER_CHANNEL_RUN);
  const emailResults = await settleInBatches(emailBatch, (candidate) => sendForecastPrealertEmail(env, candidate.row.email, safePrealert));
  const sentEmails = emailResults.filter((result) => result.status === 'fulfilled' && result.value).length;
  for (let index = 0; index < emailResults.length; index++) {
    const result = emailResults[index];
    if (result.status === 'fulfilled' && result.value && deliveryLedger) {
      await deliveryLedger.markDelivered(safePrealert.id, 'email', emailBatch[index].recipient);
    }
    if (result.status === 'rejected') errors.push(`forecast pre-alert email: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  }

  return {
    emails: sentEmails,
    errors,
    pending: emailCandidates.length > emailBatch.length,
  };
}

/**
 * Tell subscribers when a direct official schedule has reached its stated
 * time. This makes a silent execution actionable without inventing a
 * confirmed reset record or affecting forecast history.
 */
export async function notifyScheduledExecution(
  env: Env,
  notice: ScheduledExecutionNotice,
  deliveryLedger?: DeliveryLedger,
): Promise<Pick<NotifyResult, 'emails' | 'errors' | 'pending'>> {
  const errors: string[] = [];
  if (!hasPrivilegedAccess(env)) {
    return { emails: 0, errors: ['scheduled execution notice skipped: no privileged DB access'], pending: false };
  }

  let emails: SubscriptionRow[] = [];
  try {
    emails = await privListEmails(env);
  } catch (err) {
    errors.push(`fetch emails: ${err instanceof Error ? err.message : String(err)}`);
  }

  const safeNotice: ScheduledExecutionNotice = {
    ...notice,
    officialEvidenceUrl: officialEvidenceUrl(notice.officialEvidenceUrl || ''),
  };
  const emailCandidates = await pendingRecipients(emails, 'email', safeNotice.id, (row) => row.email, deliveryLedger);
  const emailBatch = emailCandidates.slice(0, MAX_DELIVERIES_PER_CHANNEL_RUN);
  const emailResults = await settleInBatches(emailBatch, (candidate) => sendScheduledExecutionEmail(env, candidate.row.email, safeNotice));
  const sentEmails = emailResults.filter((result) => result.status === 'fulfilled' && result.value).length;
  for (let index = 0; index < emailResults.length; index++) {
    const result = emailResults[index];
    if (result.status === 'fulfilled' && result.value && deliveryLedger) {
      await deliveryLedger.markDelivered(safeNotice.id, 'email', emailBatch[index].recipient);
    }
    if (result.status === 'rejected') errors.push(`scheduled execution email: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  }

  return {
    emails: sentEmails,
    errors,
    pending: emailCandidates.length > emailBatch.length,
  };
}

interface PendingRecipient<T> {
  row: T;
  recipient: string;
}

async function pendingRecipients<T>(
  rows: T[],
  channel: 'email' | 'push',
  resetId: string,
  recipientOf: (row: T) => string,
  deliveryLedger?: DeliveryLedger,
): Promise<PendingRecipient<T>[]> {
  const candidates = rows.map((row) => ({ row, recipient: recipientOf(row) }));
  if (!deliveryLedger) return candidates;
  const deliveryState = await Promise.all(candidates.map(async (candidate) => ({
    candidate,
    delivered: await deliveryLedger.hasDelivered(resetId, channel, candidate.recipient),
  })));
  return deliveryState.filter((entry) => !entry.delivered).map((entry) => entry.candidate);
}

// --- Email (Resend HTTPS API) ----------------------------------------------

async function sendEmail(env: Env, email: string, event: ResetEvent & { id: string }): Promise<boolean> {
  // A missing mail credential is a delivery failure, not a successful no-op:
  // leaving the reset unmarked lets the next automated run recover after the
  // credential is restored.
  if (!env.RESEND_API_KEY) throw new Error('Resend email delivery is not configured');
  // This timestamp must be derived from the event, not the retry time: Resend
  // checks that a repeated idempotency key has the exact same payload.
  const expiresAt = Math.floor(event.ts / 1000) + UNSUBSCRIBE_TTL_SECONDS;
  const token = env.UNSUBSCRIBE_SECRET ? await signToken(`${email.toLowerCase()}.${expiresAt}`, env.UNSUBSCRIBE_SECRET) : '';
  const unsubUrl = `${workerBase(env)}/api/unsubscribe?e=${encodeURIComponent(email.toLowerCase())}&x=${expiresAt}&t=${token}`;
  const resetTime = formatResetTime(event.ts);
  const details = resetNotificationDetails(event);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
      // The Durable Object ledger is the long-lived delivery guard. Resend's
      // idempotency key closes the shorter gap between a successful external
      // send and persisting that guard (for example a retry after a timeout).
      'idempotency-key': await resetEmailIdempotencyKey(event.id, email),
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [email],
      subject: `Codex ${details.labelEn} confirmed / 已确认：${details.labelZh}`,
      headers: unsubscribeHeaders(unsubUrl),
      ...resetEmail(env, resetTime, unsubUrl, details),
    }),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await resendError(res)}`);
  return true;
}

async function sendForecastPrealertEmail(env: Env, email: string, prealert: ForecastPrealert): Promise<boolean> {
  if (!env.RESEND_API_KEY) throw new Error('Resend email delivery is not configured');
  const expiresAt = Math.floor(prealert.evaluatedAt / 1000) + UNSUBSCRIBE_TTL_SECONDS;
  const token = env.UNSUBSCRIBE_SECRET ? await signToken(`${email.toLowerCase()}.${expiresAt}`, env.UNSUBSCRIBE_SECRET) : '';
  const unsubUrl = `${workerBase(env)}/api/unsubscribe?e=${encodeURIComponent(email.toLowerCase())}&x=${expiresAt}&t=${token}`;
  const probability = Math.round(prealert.planningProbability * 100);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
      'idempotency-key': await forecastEmailIdempotencyKey(prealert.id, email),
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [email],
      subject: `Codex reset forecast: ${probability}% within 24h / 未来 24 小时重置预告：${probability}%`,
      headers: unsubscribeHeaders(unsubUrl),
      ...forecastPrealertEmail(env, prealert, unsubUrl),
    }),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await resendError(res)}`);
  return true;
}

async function sendScheduledExecutionEmail(env: Env, email: string, notice: ScheduledExecutionNotice): Promise<boolean> {
  if (!env.RESEND_API_KEY) throw new Error('Resend email delivery is not configured');
  const expiresAt = Math.floor(notice.scheduledAt / 1000) + UNSUBSCRIBE_TTL_SECONDS;
  const token = env.UNSUBSCRIBE_SECRET ? await signToken(`${email.toLowerCase()}.${expiresAt}`, env.UNSUBSCRIBE_SECRET) : '';
  const unsubUrl = `${workerBase(env)}/api/unsubscribe?e=${encodeURIComponent(email.toLowerCase())}&x=${expiresAt}&t=${token}`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
      'idempotency-key': await scheduledExecutionEmailIdempotencyKey(notice.id, email),
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [email],
      subject: 'Codex scheduled reset is now due / Codex 预定重置现应生效',
      headers: unsubscribeHeaders(unsubUrl),
      ...scheduledExecutionEmail(env, notice, unsubUrl),
    }),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await resendError(res)}`);
  return true;
}

/** RFC 8058 one-click unsubscribe for mailbox providers plus a regular GET page for people. */
function unsubscribeHeaders(unsubUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/** Keep the provider-visible idempotency key deterministic without exposing an email address. */
async function resetEmailIdempotencyKey(resetId: string, email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `reset/${resetId}/email/${fingerprint}`;
}

async function forecastEmailIdempotencyKey(prealertId: string, email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `forecast/${prealertId}/email/${fingerprint}`;
}

async function scheduledExecutionEmailIdempotencyKey(noticeId: string, email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `scheduled/${noticeId}/email/${fingerprint}`;
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
      ...confirmationEmail(confirmUrl),
    }),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await resendError(res)}`);
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
      ...buildTestEmail(env),
    }),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await resendError(res)}`);
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
      ...healthAlertEmail(env, report),
    }),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await resendError(res)}`);
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
      ...calibrationAlertEmail(env, calibration),
    }),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await resendError(res)}`);
}

function resetEmail(env: Env, resetTime: string, unsubUrl: string, details: ResetNotificationDetails): EmailContent {
  return renderEmail({
    category: 'RESET CONFIRMED',
    title: { zh: '已确认：' + details.labelZh, en: details.labelEn + ' confirmed' },
    intro: { zh: '已确认 Codex 使用额度重置。查看官方公告，了解适用范围。', en: 'A confirmed Codex reset is available. Check the official announcement for scope.' },
    details: [
      { label: '重置类型 / Reset type', value: details.labelZh + ' / ' + details.labelEn },
      { label: '记录时间 / Recorded time', value: resetTime },
    ],
    evidence: details.evidenceUrl ? { url: details.evidenceUrl, excerpt: details.evidenceExcerpt } : undefined,
    action: { label: DASHBOARD_LABEL, url: env.SITE_URL }, unsubscribeUrl: unsubUrl,
  });
}

function forecastPrealertEmail(env: Env, prealert: ForecastPrealert, unsubUrl: string): EmailContent {
  const probability = Math.round(prealert.planningProbability * 100) + '%';
  const modelProbability = Math.round(prealert.modelProbability * 100) + '%';
  return renderEmail({
    category: '24H FORECAST',
    title: { zh: '未来 24 小时重置预告', en: 'Your next 24 hours' },
    highlight: { value: probability, label: { zh: '未来 24 小时重置综合判断', en: 'Planning likelihood within 24 hours' } },
    intro: { zh: '这是预告，不代表重置已确认。最新概率以网页为准。', en: 'This is a forecast, not a confirmed reset. Visit the dashboard for the latest likelihood.' },
    details: [{ label: '历史模型 / Historical model', value: modelProbability }],
    note: prealert.officialEvidenceUrl ? { zh: '当前官方预告支持此判断。', en: 'A current official schedule supports this forecast.' } : undefined,
    evidence: prealert.officialEvidenceUrl ? { url: prealert.officialEvidenceUrl } : undefined,
    action: { label: DASHBOARD_LABEL, url: env.SITE_URL }, unsubscribeUrl: unsubUrl,
  });
}

function scheduledExecutionEmail(env: Env, notice: ScheduledExecutionNotice, unsubUrl: string): EmailContent {
  return renderEmail({
    category: 'OFFICIAL SCHEDULE',
    title: { zh: '官方预告时间已到', en: 'Scheduled reset is now due' },
    intro: { zh: '按官方预告，Codex 额度预计现已可用。', en: 'According to the official schedule, Codex access is expected to be available now.' },
    details: [{ label: '预告时间 / Scheduled time', value: formatResetTime(notice.scheduledAt) }],
    note: {
      zh: '这是基于预告的执行通知，不是独立的重置确认；后续如有确认信息，会另行提醒。' + (notice.communityCorroborated ? '多位独立公开反馈也显示额度现已可用。' : ''),
      en: 'This is an execution notice based on the official schedule, not a separate confirmation post. We will send a confirmed-reset alert if one follows.' + (notice.communityCorroborated ? ' Independent public reports also indicate that access is available.' : ''),
    },
    evidence: notice.officialEvidenceUrl ? { url: notice.officialEvidenceUrl } : undefined,
    action: { label: DASHBOARD_LABEL, url: env.SITE_URL }, unsubscribeUrl: unsubUrl,
  });
}

/** Bilingual alerts always include China Standard Time as well as UTC. */
function formatResetTime(timestamp: number): string {
  const date = new Date(timestamp);
  const shanghai = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
  return `Asia/Shanghai (UTC+8) ${shanghai} · UTC ${date.toUTCString()}`;
}

const DASHBOARD_LABEL = { zh: '查看最新预测', en: 'Open dashboard' };

function confirmationEmail(confirmUrl: string): EmailContent {
  return renderEmail({
    category: 'SUBSCRIPTION',
    title: { zh: '确认你的提醒订阅', en: 'Confirm your subscription' },
    intro: { zh: '确认后，重置预告和已确认的重置信息会发送到此邮箱。', en: 'Confirm this address to receive reset forecasts and confirmed-reset alerts.' },
    note: { zh: '未来 24 小时综合判断达到 70% 时，每个重置周期提醒一次；官方预告时间到达时也会通知。', en: 'Receive one forecast notice per reset cycle at 70% within 24 hours, plus a notice when a direct official schedule is due.' },
    action: { label: { zh: '确认订阅', en: 'Confirm subscription' }, url: confirmUrl },
    footer: { zh: '链接 24 小时内有效。若非本人操作，请忽略此邮件。', en: 'This confirmation link expires in 24 hours. If you did not request this, ignore this email.' },
  });
}

/** Used by the protected route and any explicitly authorized manual test.
 * Build this exact subject/html/text payload instead of composing a separate mail.
 */
export function buildTestEmail(env: Pick<Env, 'SITE_URL'>): EmailContent & { subject: string } {
  return {
    subject: '[Test] Codex Resets alert delivery / 提醒投递测试',
    ...renderEmail({
      category: 'DELIVERY TEST',
      title: { zh: '这是一封测试提醒', en: 'Test alert delivery' },
      intro: { zh: '我们正在核对邮件的投递与显示效果，无需你操作。', en: 'We are checking email delivery and presentation. No action is needed.' },
      note: { zh: '本邮件不表示发生重置，也不会修改你的订阅。', en: 'This test does not indicate a Codex reset and does not change your subscription.' },
      action: { label: DASHBOARD_LABEL, url: env.SITE_URL },
      footer: { zh: '仅用于经授权的单封投递测试。', en: 'An explicitly authorized, single-recipient delivery test.' },
    }),
  };
}

function healthAlertEmail(env: Env, report: RunReport): EmailContent {
  return renderEmail({
    category: 'OPERATIONS · HEALTH',
    title: { zh: '运行状态需要检查', en: 'Worker health check failed' },
    intro: { zh: '本轮采集出现异常，以下信息仅供管理员排查。', en: 'The scheduled pipeline reported a problem. These details are for operations only.' },
    details: [
      { label: '采集时间 / Run started', value: report.startedAt },
      { label: '采集状态 / Scrape status', value: report.scrape },
      { label: '诊断摘要 / Diagnostics', value: report.errors.length ? report.errors.slice(0, 3).join('\n') : 'No diagnostic details were recorded.' },
    ],
    action: { label: { zh: '查看运行状态', en: 'Open health report' }, url: workerBase(env) + '/api/health' },
    footer: { zh: '同类运行异常提醒最多每六小时发送一次。', en: 'At most one health-failure alert is sent every six hours.' },
  });
}

function calibrationAlertEmail(env: Env, calibration: ForecastCalibration): EmailContent {
  return renderEmail({
    category: 'OPERATIONS · CALIBRATION',
    title: { zh: '预测校准复核', en: 'Forecast calibration review' },
    intro: { zh: '私有校准达到复核条件。以下为当前统计，不代表已通过正式准确率验收。', en: 'Private calibration reached a review threshold. These statistics do not imply formal accuracy acceptance.' },
    details: [
      { label: '复核阶段 / Review stage', value: calibration.stage },
      { label: '已结算样本 / Resolved samples', value: String(calibration.samples) },
      { label: '近期 Brier 分数 / Recent Brier score', value: calibration.recentBrier === null ? 'not enough samples' : calibration.recentBrier.toFixed(3) },
      { label: '趋势 / Trend', value: calibration.trend },
      { label: '48 小时高置信决策准确率 / High-confidence 48h accuracy', value: calibration.decisionAccuracy48h.accuracy === null ? 'not enough high-confidence decisions' : Math.round(calibration.decisionAccuracy48h.accuracy * 100) + '%' },
    ],
    action: { label: { zh: '查看运行状态', en: 'Open health report' }, url: workerBase(env) + '/api/health' },
    footer: { zh: '仅用于管理员复核，不改变订阅通知或模型选择。', en: 'Operations review only. Subscriber delivery and automatic model selection are unchanged.' },
  });
}

// --- Web Push (VAPID + aes128gcm via Web Crypto) ----------------------------

async function sendPush(env: Env, row: PushSubRow, event: ResetEvent): Promise<'sent' | 'gone' | 'skipped'> {
  // As with email, do not mark an alert complete when configured Push
  // subscribers could not receive it.
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) throw new Error('VAPID Push delivery is not configured');

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
  const details = resetNotificationDetails(event);
  const message: PushMessage = {
    data: JSON.stringify({
      title: 'Codex Reset Alert / Codex 重置提醒',
      body: `${details.labelEn} confirmed / 已确认：${details.labelZh}`,
      url: details.evidenceUrl || '/',
      actionTitle: details.evidenceUrl
        ? 'View official announcement / 查看官方公告'
        : 'Open dashboard / 打开仪表盘',
    }),
    options: { ttl: 86400 },
  };

  const payload = await buildPushPayload(message, subscription, vapid);
  const res = await fetch(subscription.endpoint, { ...payload, redirect: 'error', signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS) });
  if (isExpiredPushEndpoint(res.status)) return 'gone';
  if (!res.ok) throw new Error(`push endpoint ${res.status}`);
  return 'sent';
}

function resetNotificationDetails(event: ResetEvent): ResetNotificationDetails {
  const type = classifyResetNotification(event.text);
  const labels: Record<ResetNotificationType, Pick<ResetNotificationDetails, 'labelEn' | 'labelZh'>> = {
    banked: { labelEn: 'Banked reset', labelZh: '积存额度重置' },
    direct: { labelEn: 'Direct usage-limit reset', labelZh: '直接额度重置' },
    quota: { labelEn: 'Quota reset', labelZh: '配额重置' },
    credits: { labelEn: 'Credit reset', labelZh: '额度重置' },
  };
  return {
    type,
    ...labels[type],
    evidenceUrl: officialEvidenceUrl(event.link),
    evidenceExcerpt: event.text ? event.text.slice(0, 280) : null,
  };
}

/** Only the canonical official-post shape is safe to place in subscriber mail. */
function officialEvidenceUrl(link: string): string | null {
  try {
    const url = new URL(link);
    const officialHost = url.protocol === 'https:' && (url.hostname === 'x.com' || url.hostname === 'www.x.com');
    const officialPost = /^\/[^/]+\/status\/\d+$/.test(url.pathname);
    return officialHost && officialPost ? `https://x.com${url.pathname}` : null;
  } catch {
    return null;
  }
}

function workerBase(env: Env): string {
  // PUBLIC_URL is set after the first deploy (workers.dev subdomain)
  return (env as Env & { PUBLIC_URL?: string }).PUBLIC_URL || env.SITE_URL;
}

async function resendError(response: Response): Promise<string> {
  return await readTextWithin(response, PROVIDER_ERROR_MAX_BYTES) ?? 'response body too large';
}
