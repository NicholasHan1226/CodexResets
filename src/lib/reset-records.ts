/**
 * Reset Records Service
 * Fetches verified reset history from Supabase.
 */

import { getSupabase } from '@/lib/supabase';
import type { ResetRecord } from '@/types/reset';

const DEFAULT_READ_TIMEOUT_MS = 3500;

/**
 * Fetch the current verified records. Prediction history is small, so keeping
 * it out of localStorage avoids a stale browser cache changing a new visit.
 */
export async function fetchResetRecords(timeoutMs = DEFAULT_READ_TIMEOUT_MS): Promise<ResetRecord[]> {
  return withDeadline(readResetRecords(), timeoutMs);
}

async function readResetRecords(): Promise<ResetRecord[]> {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('reset_records')
      .select('id,reset_date,verified')
      .eq('verified', true)
      .order('reset_date', { ascending: false });

    if (error) {
      console.error('Failed to fetch reset records:', error);
      return [];
    }

    const records: ResetRecord[] = (data || []).map((row: {
      id: string;
      reset_date: string;
      verified: boolean;
    }) => ({
      id: row.id,
      date: new Date(row.reset_date).toISOString().split('T')[0],
      timestamp: new Date(row.reset_date).getTime(),
      reason: 'verified reset',
      verified: row.verified,
    }));

    return records;
  } catch (err) {
    console.error('Network error fetching reset records:', err);
    return [];
  }
}

function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve([] as T), timeoutMs);
    void promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      () => {
        window.clearTimeout(timeout);
        resolve([] as T);
      },
    );
  });
}
