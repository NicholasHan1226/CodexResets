import { getSupabase } from "@/lib/supabase";

export type SubscribeStatus = 'new' | 'existing' | 'reactivated' | 'invalid';

/**
 * Subscribe an email to Codex Reset notifications.
 * Single atomic RPC (security definer): validates, inserts, or re-activates.
 * Anon has no SELECT/UPDATE on subscriptions — this function is the only
 * write path, which keeps the email list unreadable via the public key.
 */
export async function subscribeEmail(email: string): Promise<SubscribeStatus> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('subscribe_email', {
    p_email: email.trim().toLowerCase(),
  });
  if (error) throw new Error(error.message);
  const status = String(data);
  if (status === 'new' || status === 'existing' || status === 'reactivated' || status === 'invalid') {
    return status;
  }
  throw new Error(`unexpected status: ${status}`);
}
