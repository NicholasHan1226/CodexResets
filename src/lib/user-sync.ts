import { supabase } from '@/lib/supabase';

export interface CloudUserData {
  usage_data: Record<string, unknown>;
  banked_resets: unknown[];
  updated_at: string;
}

/**
 * Pull the user's cloud data. Returns null when no row exists yet.
 */
export async function fetchCloudData(userId: string): Promise<CloudUserData | null> {
  const { data, error } = await supabase
    .from('user_data')
    .select('usage_data, banked_resets, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[sync] fetch failed:', error.message);
    return null;
  }
  return data as CloudUserData | null;
}

/**
 * Upsert one slice of the user's cloud data (usage and/or banked resets).
 */
export async function pushCloudData(
  userId: string,
  patch: { usage_data?: Record<string, unknown>; banked_resets?: unknown[] }
): Promise<boolean> {
  const { error } = await supabase
    .from('user_data')
    .upsert(
      {
        user_id: userId,
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    console.error('[sync] push failed:', error.message);
    return false;
  }
  return true;
}
