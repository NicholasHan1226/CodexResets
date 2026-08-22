/**
 * Reset Records Service
 * Fetches reset history from Supabase with localStorage caching
 */

import { getSupabase } from '@/lib/supabase';
import type { ResetRecord } from '@/types/reset';

const CACHE_KEY = 'codex-resets:records';
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

interface CachedData {
  records: ResetRecord[];
  timestamp: number;
}

/**
 * Fetch reset records from Supabase with caching
 */
export async function fetchResetRecords(): Promise<ResetRecord[]> {
  // Check cache first
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const data: CachedData = JSON.parse(cached);
      if (Date.now() - data.timestamp < CACHE_TTL) {
        return data.records;
      }
    } catch {
      // Invalid cache, continue to fetch
    }
  }

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('reset_records')
      .select('*')
      .eq('verified', true)
      .order('reset_date', { ascending: false });

    if (error) {
      console.error('Failed to fetch reset records:', error);
      // Return cached data if available, even if expired
      if (cached) {
        const data: CachedData = JSON.parse(cached);
        return data.records;
      }
      return [];
    }

    const records: ResetRecord[] = (data || []).map((row: {
      id: string;
      reset_date: string;
      source_url: string | null;
      description: string | null;
      verified: boolean;
    }) => ({
      id: row.id,
      date: new Date(row.reset_date).toISOString().split('T')[0],
      timestamp: new Date(row.reset_date).getTime(),
      reason: row.description || 'Scheduled reset',
      source: row.source_url || undefined,
      verified: row.verified,
    }));

    // Update cache
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      records,
      timestamp: Date.now(),
    }));

    return records;
  } catch (err) {
    console.error('Network error fetching reset records:', err);
    // Return cached data if available
    if (cached) {
      const data: CachedData = JSON.parse(cached);
      return data.records;
    }
    return [];
  }
}

/**
 * Clear the reset records cache
 */
export function clearResetRecordsCache(): void {
  localStorage.removeItem(CACHE_KEY);
}
