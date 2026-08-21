import type { Env } from './types';
import { sb, sbSelect } from './supabase';

/**
 * Privileged DB access gateway.
 * Primary path: SUPABASE_SERVICE_ROLE_KEY (RLS bypass via PostgREST).
 * Fallback path: security-definer RPC functions gated by PIPELINE_SECRET —
 * exists because this project's Supabase-compatible host does not expose
 * the service_role JWT through its platform dashboard. If the real key is
 * ever configured it takes precedence automatically.
 */
export function hasPrivilegedAccess(env: Env): boolean {
  return Boolean(env.SUPABASE_SERVICE_ROLE_KEY || env.PIPELINE_SECRET);
}

function rpc(env: Env, fn: string, args: Record<string, unknown>): Promise<Response> {
  return sb(env, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
}

export interface ResetInsertRow {
  reset_date: string;
  description: string;
  source_url: string;
  verified: boolean;
}

export async function privInsertResets(env: Env, rows: ResetInsertRow[]): Promise<Response> {
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    return sb(env, 'reset_records', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    }, true);
  }
  return rpc(env, 'pipeline_insert_resets', { p_secret: env.PIPELINE_SECRET, p_rows: rows });
}

export async function privListEmails(env: Env): Promise<{ email: string }[]> {
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    return sbSelect(env, 'subscriptions?select=email&is_active=eq.true', true);
  }
  const res = await rpc(env, 'pipeline_list_emails', { p_secret: env.PIPELINE_SECRET });
  if (!res.ok) throw new Error(`list emails: ${res.status} ${await res.text()}`);
  return (await res.json()) as { email: string }[];
}

export interface PushSubRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function privListPush(env: Env): Promise<PushSubRow[]> {
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    return sbSelect(env, 'push_subscriptions?select=endpoint,p256dh,auth', true);
  }
  const res = await rpc(env, 'pipeline_list_push', { p_secret: env.PIPELINE_SECRET });
  if (!res.ok) throw new Error(`list push: ${res.status} ${await res.text()}`);
  return (await res.json()) as PushSubRow[];
}

export async function privUpsertPush(env: Env, row: PushSubRow & { user_agent: string | null }): Promise<Response> {
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    return sb(env, 'push_subscriptions?on_conflict=endpoint', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([row]),
    }, true);
  }
  return rpc(env, 'pipeline_upsert_push', {
    p_secret: env.PIPELINE_SECRET,
    p_endpoint: row.endpoint,
    p_p256dh: row.p256dh,
    p_auth: row.auth,
    p_user_agent: row.user_agent,
  });
}

export async function privDeletePush(env: Env, endpoint: string): Promise<Response> {
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    return sb(env, `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' }, true);
  }
  return rpc(env, 'pipeline_delete_push', { p_secret: env.PIPELINE_SECRET, p_endpoint: endpoint });
}

export async function privDeactivateEmail(env: Env, email: string): Promise<Response> {
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    return sb(env, `subscriptions?email=eq.${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ is_active: false, unsubscribed_at: new Date().toISOString() }),
    }, true);
  }
  return rpc(env, 'pipeline_deactivate_email', { p_secret: env.PIPELINE_SECRET, p_email: email });
}
