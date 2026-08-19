/**
 * Real signal fetcher - pulls live data from public sources
 * - Tibo's X/Twitter posts via RSS proxy
 * - OpenAI status page via public API
 */

import type { ResetSignal } from '@/types/reset';

// RSS proxy for Twitter/X feeds
const RSS2JSON_API = 'https://api.rss2json.com/v1/api.json';
const TIBO_RSS_URL = 'https://rsshub.app/twitter/user/thsottiaux';

// OpenAI status page API
const OPENAI_STATUS_API = 'https://status.openai.com/api/v2/incidents.json';

// Cache for fetched data
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(key: string, data: T, ttl: number): void {
  cache.set(key, { data, timestamp: Date.now(), ttl });
}

// Fetch Tibo's recent tweets via RSS proxy
export async function fetchTiboTweets(): Promise<ResetSignal | null> {
  const cacheKey = 'tibo_tweets';
  const cached = getCached<ResetSignal>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(
      `${RSS2JSON_API}?rss_url=${encodeURIComponent(TIBO_RSS_URL)}&count=10`
    );
    
    if (!response.ok) {
      console.warn('Failed to fetch Tibo tweets:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data.status !== 'ok' || !data.items || data.items.length === 0) {
      return null;
    }

    // Find tweets related to reset/limits/usage
    const resetKeywords = ['reset', 'limits', 'usage', 'credits', 'quota', 'refresh'];
    const recentTweets = data.items.slice(0, 10);
    
    // Find the most recent reset-related tweet
    const resetTweet = recentTweets.find((tweet: { description: string; title: string }) => {
      const text = (tweet.description || tweet.title || '').toLowerCase();
      return resetKeywords.some(kw => text.includes(kw));
    });

    const latestTweet = recentTweets[0];
    const tweetDate = new Date(latestTweet.pubDate);
    const hoursAgo = Math.floor((Date.now() - tweetDate.getTime()) / (1000 * 60 * 60));
    const daysAgo = Math.floor(hoursAgo / 24);

    // Determine signal status based on reset-related content
    let status: ResetSignal['status'];
    let description: string;
    let value: number;

    if (resetTweet) {
      const resetTweetDate = new Date(resetTweet.pubDate);
      const resetHoursAgo = Math.floor((Date.now() - resetTweetDate.getTime()) / (1000 * 60 * 60));
      
      if (resetHoursAgo < 24) {
        status = 'active';
        description = `Reset announced ${resetHoursAgo}h ago`;
        value = 0.9;
      } else if (resetHoursAgo < 72) {
        status = 'weak';
        description = `Reset mentioned ${Math.floor(resetHoursAgo / 24)}d ago`;
        value = 0.4;
      } else {
        status = 'idle';
        description = `Last reset signal ${Math.floor(resetHoursAgo / 24)}d ago`;
        value = 0.1;
      }
    } else {
      // No reset-related tweets recently
      if (hoursAgo < 12) {
        status = 'weak';
        description = `Active today, no reset hints`;
        value = 0.2;
      } else {
        status = 'idle';
        description = `Last activity ${daysAgo}d ago`;
        value = 0.05;
      }
    }

    const signal: ResetSignal = {
      source: 'tibo',
      label: "Tibo's Posts",
      status,
      value,
      description,
      updatedAt: Date.now(),
      sourceUrl: 'https://x.com/thsottiaux',
    };

    // Cache for 30 minutes
    setCache(cacheKey, signal, 30 * 60 * 1000);
    return signal;

  } catch (error) {
    console.warn('Error fetching Tibo tweets:', error);
    return null;
  }
}

// Fetch OpenAI status page incidents
export async function fetchOpenAIStatus(): Promise<ResetSignal | null> {
  const cacheKey = 'openai_status';
  const cached = getCached<ResetSignal>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(OPENAI_STATUS_API);
    
    if (!response.ok) {
      console.warn('Failed to fetch OpenAI status:', response.status);
      return null;
    }

    const data = await response.json();
    const incidents = data.incidents || [];

    // Check for active Codex-related incidents
    const codexKeywords = ['codex', 'rate limit', 'usage limit', 'quota'];
    const activeIncidents = incidents.filter((inc: { status: string; resolved_at: string | null }) => 
      inc.status !== 'resolved' && !inc.resolved_at
    );

    const codexIncidents = activeIncidents.filter((inc: { name: string; incident_update_messages?: Array<{ body: string }> }) => {
      const name = (inc.name || '').toLowerCase();
      const updates = (inc.incident_update_messages || []).map((u: { body: string }) => u.body.toLowerCase()).join(' ');
      return codexKeywords.some(kw => name.includes(kw) || updates.includes(kw));
    });

    let status: ResetSignal['status'];
    let description: string;
    let value: number;

    if (codexIncidents.length > 0) {
      status = 'active';
      description = `${codexIncidents.length} active Codex incident(s)`;
      value = 0.8;
    } else if (activeIncidents.length > 0) {
      status = 'weak';
      description = `${activeIncidents.length} active incident(s), Codex OK`;
      value = 0.3;
    } else {
      status = 'idle';
      description = 'No open incidents';
      value = 0;
    }

    const signal: ResetSignal = {
      source: 'openai_status',
      label: 'OpenAI Status',
      status,
      value,
      description,
      updatedAt: Date.now(),
      sourceUrl: 'https://status.openai.com',
    };

    // Cache for 15 minutes
    setCache(cacheKey, signal, 15 * 60 * 1000);
    return signal;

  } catch (error) {
    console.warn('Error fetching OpenAI status:', error);
    return null;
  }
}

// Fetch all real signals
export async function fetchRealSignals(): Promise<ResetSignal[]> {
  const results = await Promise.allSettled([
    fetchTiboTweets(),
    fetchOpenAIStatus(),
  ]);

  const signals: ResetSignal[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      signals.push(result.value);
    }
  }

  return signals;
}

// Check if we have real signal data or should fall back to simulated
export async function getSignalsWithFallback(simulatedSignals: ResetSignal[]): Promise<{ signals: ResetSignal[]; hasRealData: boolean }> {
  const realSignals = await fetchRealSignals();
  
  if (realSignals.length === 0) {
    // Fall back to simulated data if real fetch fails
    return { signals: simulatedSignals, hasRealData: false };
  }

  // Merge: use real data where available, simulated for missing sources
  const realSources = new Set(realSignals.map(s => s.source));
  const missingSignals = simulatedSignals.filter(s => !realSources.has(s.source));
  
  return { 
    signals: [...realSignals, ...missingSignals], 
    hasRealData: true 
  };
}
