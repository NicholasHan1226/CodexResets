import { buildPushPayload, type PushMessage, type PushSubscription, type VapidKeys } from '@block65/webcrypto-web-push';
import type { Env, ResetEvent } from './types';
import { hasPrivilegedAccess, privListEmails, privListPush, privDeletePush, type PushSubRow } from './privileged';
import { signToken, escapeHtml } from './util';

interface SubscriptionRow {
  email: string;
}

export interface NotifyResult {
  emails: number;
  pushes: number;
  errors: string[];
}

/** Fan out a freshly detected reset to every subscriber (email + web push) */
export async function notifyAll(env: Env, event: ResetEvent): Promise<NotifyResult> {
  const errors: string[] = [];
  if (!hasPrivilegedAccess(env)) {
    return { emails: 0, pushes: 0, errors: ['notify skipped: no privileged DB access'] };
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

  const emailResults = await Promise.allSettled(emails.map((row) => sendEmail(env, row.email, event)));
  const sentEmails = emailResults.filter((r) => r.status === 'fulfilled' && r.value).length;
  for (const r of emailResults) {
    if (r.status === 'rejected') errors.push(`email: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  }

  const pushResults = await Promise.allSettled(pushes.map((row) => sendPush(env, row, event)));
  let sentPushes = 0;
  for (let i = 0; i < pushResults.length; i++) {
    const r = pushResults[i];
    if (r.status === 'fulfilled') {
      if (r.value === 'gone') {
        // Endpoint is dead — prune it so the list stays clean
        await privDeletePush(env, pushes[i].endpoint).catch(() => {});
      } else if (r.value === 'sent') {
        sentPushes++;
      }
    } else {
      errors.push(`push: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  }

  return { emails: sentEmails, pushes: sentPushes, errors };
}

// --- Email (Resend HTTPS API) ----------------------------------------------

async function sendEmail(env: Env, email: string, event: ResetEvent): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  const token = env.UNSUBSCRIBE_SECRET ? await signToken(email.toLowerCase(), env.UNSUBSCRIBE_SECRET) : '';
  const unsubUrl = `${workerBase(env)}/api/unsubscribe?e=${encodeURIComponent(email.toLowerCase())}&t=${token}`;
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
      subject: 'Codex usage limits were reset',
      headers: { 'List-Unsubscribe': `<${unsubUrl}>` },
      html: emailHtml(env, event.text, resetLocal, unsubUrl),
    }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
  return true;
}

function emailHtml(env: Env, excerpt: string, resetLocal: string, unsubUrl: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f8;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#16171c">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e6ea;border-radius:8px;padding:24px">
    <p style="margin:0 0 4px;font-family:'SF Mono',Menlo,monospace;font-size:12px;color:#10a37f">❯ codex resets</p>
    <h1 style="margin:0 0 12px;font-size:20px">Usage limits were reset</h1>
    <p style="margin:0 0 8px;font-size:14px;color:#3d4250">A new reset was detected from @thsottiaux:</p>
    <blockquote style="margin:0 0 12px;padding:10px 12px;border-left:3px solid #10a37f;background:#f0fdf9;font-size:13px;color:#3d4250">${escapeHtml(excerpt)}</blockquote>
    <p style="margin:0 0 16px;font-family:Menlo,monospace;font-size:12px;color:#7c8494">${escapeHtml(resetLocal)}</p>
    <a href="${env.SITE_URL}" style="display:inline-block;background:#10a37f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:6px">Open dashboard</a>
    <hr style="margin:20px 0 12px;border:none;border-top:1px solid #e4e6ea" />
    <p style="margin:0;font-size:11px;color:#9aa0ac">You received this because you subscribed at codexresets.cc · <a href="${unsubUrl}" style="color:#9aa0ac">Unsubscribe</a></p>
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
  const res = await fetch(subscription.endpoint, payload);
  if (res.status === 404 || res.status === 410) return 'gone';
  if (!res.ok) throw new Error(`push endpoint ${res.status}`);
  return 'sent';
}

function workerBase(env: Env): string {
  // PUBLIC_URL is set after the first deploy (workers.dev subdomain)
  return (env as Env & { PUBLIC_URL?: string }).PUBLIC_URL || env.SITE_URL;
}
