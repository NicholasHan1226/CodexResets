/**
 * Reset Records Service
 * Fetches verified reset history from Supabase.
 */

import { getSupabase } from '@/lib/supabase';
import type { ResetRecord } from '@/types/reset';

/**
 * Fetch the current verified records. Prediction history is small, so keeping
 * it out of localStorage avoids a stale browser cache changing a new visit.
 */
export async function fetchResetRecords(): Promise<ResetRecord[]> {
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
