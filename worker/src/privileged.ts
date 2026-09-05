import type { Env } from './types';
import { sb } from './supabase';
import type { EmailLocale } from './email-template';

/** Privileged DB gateway: only the Worker service-role secret may write or read private data. */
export function hasPrivilegedAccess(env: Env): boolean {
  return Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
}

export interface ResetInsertRow {
  reset_date: string;
  description: string;
  source_url: string;
  verified: boolean;
  automated?: boolean;
  auto_state?: 'observed' | 'manual';
  auto_confirm_after?: string;
}

export async function privInsertResets(env: Env, rows: ResetInsertRow[]): Promise<Response> {
  return sb(env, 'reset_records', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(rows),
  }, true);
}

export interface EmailSubscriptionRow { email: string; locale?: EmailLocale }

export async function privListEmails(env: Env): Promise<EmailSubscriptionRow[]> {
  return listRecipients<EmailSubscriptionRow>(env, 'subscriptions?select=email,locale&is_active=eq.true', 'email');
}

export interface PushSubRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function privListPush(env: Env): Promise<PushSubRow[]> {
  return listRecipients<PushSubRow>(env, 'push_subscriptions?select=endpoint,p256dh,auth', 'endpoint');
}

/** Keyset pagination keeps server row caps from silently truncating delivery. */
async function listRecipients<T>(env: Env, base: string, key: keyof T & string): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    // PostgREST quoted literals escape both backslashes and double quotes;
    // URI encoding alone does not escape its filter grammar.
    const quoted = cursor === undefined ? '' : '"' + cursor.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    const path = `${base}&order=${key}.asc&limit=500${cursor === undefined ? '' : `&${key}=gt.${encodeURIComponent(quoted)}`}`;
    let page: T[];
    try {
      const response = await sb(env, path, {}, true);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      page = await response.json() as T[];
    } catch {
      // A path or provider error can contain the private cursor; never log it.
      throw new Error('private subscription pagination failed');
    }
    if (!Array.isArray(page)) throw new Error('private subscription pagination invalid response');
    if (!page.length) return rows;
    for (const row of page) {
      const value = row?.[key];
      if (typeof value !== 'string' || !value || seen.has(value)) {
        throw new Error('private subscription pagination made no progress');
      }
      seen.add(value);
      rows.push(row);
    }
    cursor = page[page.length - 1][key] as string;
  }
}

export async function privUpsertPush(env: Env, row: PushSubRow & { user_agent: string | null }): Promise<Response> {
  return sb(env, 'push_subscriptions?on_conflict=endpoint', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([row]),
  }, true);
}

export async function privDeletePush(env: Env, endpoint: string, auth?: string, p256dh?: string): Promise<Response> {
  const proofFilter = auth && p256dh
    ? `&auth=eq.${encodeURIComponent(auth)}&p256dh=eq.${encodeURIComponent(p256dh)}`
    : '';
  return sb(env, `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}${proofFilter}`, { method: 'DELETE' }, true);
}

/** Remove an address after an explicit unsubscribe, hard bounce, or complaint. */
export async function privDeleteEmail(env: Env, email: string): Promise<Response> {
  return sb(env, `subscriptions?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE' }, true);
}

/** Idempotently activate the address after the Worker-owned double opt-in. */
export async function privActivateEmail(env: Env, email: string, locale: EmailLocale = null): Promise<Response> {
  return sb(env, 'subscriptions?on_conflict=email', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    // An old confirmation token must not erase a previously saved preference.
    body: JSON.stringify([{ email, is_active: true, unsubscribed_at: null, ...(locale ? { locale } : {}) }]),
  }, true);
}

/** Promote an observed reset after the Worker-owned stabilization window. */
export async function privConfirmAutomatedReset(env: Env, id: string): Promise<Response> {
  return sb(env, `reset_records?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ verified: true, auto_state: 'confirmed', auto_confirm_after: null }),
  }, true);
}

/** Suppress a pending automated reset after a later correction from the source. */
export async function privRetractAutomatedReset(env: Env, id: string): Promise<Response> {
  return sb(env, `reset_records?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ verified: false, auto_state: 'retracted', retracted_at: new Date().toISOString() }),
  }, true);
}

/** Enroll a legacy pending discovery in the fully automated lifecycle. */
export async function privQueueAutomatedReset(env: Env, id: string, confirmAfter: string): Promise<Response> {
  return sb(env, `reset_records?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ automated: true, auto_state: 'observed', auto_confirm_after: confirmAfter }),
  }, true);
}

/** Mark a confirmed reset as delivered only after a successful fan-out. */
export async function privMarkResetNotified(env: Env, id: string): Promise<Response> {
  return sb(env, `reset_records?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ notified_at: new Date().toISOString() }),
  }, true);
}
