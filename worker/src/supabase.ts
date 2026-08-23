import type { Env } from './types';
import { readTextWithin } from './util';

const SUPABASE_ERROR_MAX_BYTES = 8 * 1024;
const SUPABASE_TIMEOUT_MS = 8_000;

/**
 * Minimal PostgREST client.
 * Reads use the anon key where RLS allows it; writes and sensitive reads
 * (subscriptions, push_subscriptions) go through the service role key.
 */
export function sb(env: Env, path: string, init: RequestInit = {}, useService = false): Promise<Response> {
  const key = useService ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY;
  if (!key) throw new Error(useService ? 'SUPABASE_SERVICE_ROLE_KEY not configured' : 'SUPABASE_ANON_KEY not configured');
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    // A stalled database request must not consume the entire cron run and
    // prevent the Worker from publishing its next health/signal snapshot.
    signal: init.signal ?? AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

export async function sbSelect<T>(env: Env, path: string, useService = false): Promise<T[]> {
  const res = await sb(env, path, {}, useService);
  if (!res.ok) {
    const detail = await readTextWithin(res, SUPABASE_ERROR_MAX_BYTES) ?? 'response body too large';
    throw new Error(`select ${path} failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as T[];
}

export async function sbInsert(env: Env, table: string, rows: unknown[]): Promise<Response> {
  return sb(env, table, {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  }, true);
}

export async function sbUpsert(env: Env, table: string, rows: unknown[]): Promise<Response> {
  return sb(env, table, {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  }, true);
}

export async function sbDelete(env: Env, path: string): Promise<Response> {
  return sb(env, path, { method: 'DELETE' }, true);
}

export async function sbUpdate(env: Env, path: string, patch: unknown): Promise<Response> {
  return sb(env, path, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  }, true);
}
