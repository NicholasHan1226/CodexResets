/**
 * Real signal fetcher — three-tier strategy:
 * 1. Pipeline snapshot (Cloudflare Worker scrapes server-side every 30min,
 *    far more reliable than browser-side attempts)
 * 2. Immediate local fallback in production; direct browser reads are kept
 *    only for local development without a configured pipeline URL.
 */

import type { ResetRecord, ResetSignal } from '@/types/reset';

const PIPELINE_API_URL = (import.meta.env.VITE_PIPELINE_API_URL || '').replace(/\/+$/, '');
const PIPELINE_TIMEOUT_MS = 3500;
export const PIPELINE_SNAPSHOT_MAX_AGE_MS = 90 * 60 * 1000;
const PIPELINE_SIGNAL_SOURCES = ['tibopost', 'status_page', 'cooldown', 'launch_noise'] as const;
const PIPELINE_SIGNAL_SOURCE_SET = new Set<string>(PIPELINE_SIGNAL_SOURCES);

interface PipelineSnapshot {
  signals: ResetSignal[];
  generatedAt: number;
  history?: PipelineHistoryRow[];
}

interface PipelineHistoryRow {
  id: string;
  reset_date: string;
  verified: true;
}

export interface DashboardInputs {
  signals: ResetSignal[];
  hasRealData: boolean;
  /** Server snapshot creation time; null when the browser used a local fallback. */
  generatedAt: number | null;
  /** null means the caller should use its bundled local baseline. */
  records: ResetRecord[] | null;
}

export function isFreshPipelineSnapshot(generatedAt: unknown, now = Date.now()): generatedAt is number {
  return typeof generatedAt === 'number'
    && Number.isFinite(generatedAt)
    && generatedAt <= now + 5 * 60 * 1000
    && now - generatedAt <= PIPELINE_SNAPSHOT_MAX_AGE_MS;
}

/**
 * A partially formed Worker response must not be presented as a LIVE model
 * beside locally generated substitutes. The pipeline owns these four sources;
 * accept the snapshot only when every source is present exactly once and each
 * display value is safe to render.
 */
export function isCompletePipelineSnapshot(snapshot: Partial<PipelineSnapshot>, now = Date.now()): snapshot is PipelineSnapshot {
  const generatedAt = snapshot.generatedAt;
  if (!isFreshPipelineSnapshot(generatedAt, now)
    || !Array.isArray(snapshot.signals)
    || snapshot.signals.length !== PIPELINE_SIGNAL_SOURCES.length) return false;

  const seen = new Set<string>();
  for (const signal of snapshot.signals) {
    if (!signal || !PIPELINE_SIGNAL_SOURCE_SET.has(signal.source)
      || seen.has(signal.source)
      || typeof signal.label !== 'string' || signal.label.length === 0
      || typeof signal.description !== 'string' || signal.description.length === 0
      || (signal.status !== 'active' && signal.status !== 'weak' && signal.status !== 'idle')
      || typeof signal.value !== 'number' || !Number.isFinite(signal.value) || signal.value < 0 || signal.value > 1
      || typeof signal.updatedAt !== 'number' || !Number.isFinite(signal.updatedAt)
      || signal.updatedAt > now + 5 * 60 * 1000) return false;
    seen.add(signal.source);
  }
  if (snapshot.history !== undefined && (!Array.isArray(snapshot.history) || snapshot.history.some((row) => {
    const timestamp = row && typeof row.reset_date === 'string' ? Date.parse(row.reset_date) : Number.NaN;
    return !row || typeof row.id !== 'string' || row.verified !== true || !Number.isFinite(timestamp)
      || timestamp > generatedAt + 5 * 60 * 1000;
  }))) return false;
  return seen.size === PIPELINE_SIGNAL_SOURCES.length;
}

// Fetch the server-side snapshot built by the pipeline Worker. Signals and
// compact verified history arrive together, avoiding a second critical-path
// request on the first dashboard render.
async function fetchPipelineSnapshot(force = false): Promise<PipelineSnapshot | null> {
  if (!PIPELINE_API_URL) return null;

  const cacheKey = 'pipeline_snapshot';
  const cached = force ? null : getCached<PipelineSnapshot>(cacheKey);
  if (cached) return cached;

  try {
    const endpoint = force
      ? `${PIPELINE_API_URL}/api/signals?refresh=${Date.now()}`
      : `${PIPELINE_API_URL}/api/signals`;
    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(PIPELINE_TIMEOUT_MS),
      cache: force ? 'no-store' : 'default',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PipelineSnapshot;
    if (!isCompletePipelineSnapshot(data)) return null;
    // Snapshot is refreshed every 30min server-side; cache for 5min locally
    const snapshot: PipelineSnapshot = {
      signals: data.signals,
      generatedAt: data.generatedAt,
      // Older deployed Workers do not have this field; keep the compatible
      // direct-read fallback only for that short rollout window.
      history: Array.isArray(data.history) ? data.history : undefined,
    };
    setCache(cacheKey, snapshot, 5 * 60 * 1000);
    return snapshot;
  } catch {
    return null;
  }
}

export async function fetchPipelineSignals(force = false): Promise<ResetSignal[] | null> {
  return (await fetchPipelineSnapshot(force))?.signals ?? null;
}

// RSS proxies for Twitter/X feeds (fallback chain)
const RSS_PROXIES = [
  'https://api.rss2json.com/v1/api.json',
  'https://api.allorigins.win/raw?url=',
];
const TIBO_RSS_URL = 'https://rsshub.app/twitter/user/thsottiaux';

// OpenAI status page API (with fallback)
const OPENAI_STATUS_APIS = [
  'https://status.openai.com/api/v2/incidents.json',
  'https://status.openai.com/history',
];

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

// Fetch with fallback across multiple proxies
async function fetchWithFallback(urls: string[], options?: RequestInit): Promise<Response | null> {
  for (const url of urls) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
      if (response.ok) return response;
    } catch {
      continue;
    }
  }
  return null;
}

// Fetch Tibo's recent tweets via RSS proxy with fallback
export async function fetchTiboTweets(): Promise<ResetSignal | null> {
  const cacheKey = 'tibo_tweets';
  const cached = getCached<ResetSignal>(cacheKey);
  if (cached) return cached;

  try {
    // Try primary proxy
    const primaryUrl = `${RSS_PROXIES[0]}?rss_url=${encodeURIComponent(TIBO_RSS_URL)}&count=10`;
    let response = await fetchWithFallback([primaryUrl]);
    
    // If primary fails, try alternative proxy
    if (!response) {
      const altUrl = `${RSS_PROXIES[1]}${encodeURIComponent(TIBO_RSS_URL)}`;
      response = await fetchWithFallback([altUrl]);
    }

    if (!response) {
      console.warn('All RSS proxies failed for Tibo tweets');
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
    let descriptionKey: string;
    let descriptionParams: Record<string, string | number> = {};
    let value: number;

    if (resetTweet) {
      const resetTweetDate = new Date(resetTweet.pubDate);
      const resetHoursAgo = Math.floor((Date.now() - resetTweetDate.getTime()) / (1000 * 60 * 60));
      
      if (resetHoursAgo < 24) {
        status = 'active';
        descriptionKey = 'resetAnnounced';
        descriptionParams = { hours: resetHoursAgo };
        value = 0.9;
      } else if (resetHoursAgo < 72) {
        status = 'weak';
        descriptionKey = 'resetMentioned';
        descriptionParams = { days: Math.floor(resetHoursAgo / 24) };
        value = 0.4;
      } else {
        status = 'idle';
        descriptionKey = 'lastResetSignal';
        descriptionParams = { days: Math.floor(resetHoursAgo / 24) };
        value = 0.1;
      }
    } else {
      // No reset-related tweets recently
      if (hoursAgo < 12) {
        status = 'weak';
        descriptionKey = 'activeTodayNoHints';
        value = 0.2;
      } else {
        status = 'idle';
        descriptionKey = 'lastActivity';
        descriptionParams = { days: daysAgo };
        value = 0.05;
      }
    }

    const signal: ResetSignal = {
      // Keep the browser fallback on the same canonical source IDs as the
      // Worker snapshot, so the merge never shows one source twice.
      source: 'tibopost',
      label: 'Tibo Posting',
      status,
      value,
      description: descriptionKey,
      descriptionParams,
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

// Fetch OpenAI status page incidents with fallback
export async function fetchOpenAIStatus(): Promise<ResetSignal | null> {
  const cacheKey = 'openai_status';
  const cached = getCached<ResetSignal>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetchWithFallback(OPENAI_STATUS_APIS);
    
    if (!response) {
      console.warn('All OpenAI status APIs failed');
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
    let descriptionKey: string;
    let descriptionParams: Record<string, string | number> = {};
    let value: number;

    if (codexIncidents.length > 0) {
      status = 'active';
      descriptionKey = 'activeCodexIncidents';
      descriptionParams = { count: codexIncidents.length };
      value = 0.8;
    } else if (activeIncidents.length > 0) {
      status = 'weak';
      descriptionKey = 'activeIncidentsCodexOk';
      descriptionParams = { count: activeIncidents.length };
      value = 0.3;
    } else {
      status = 'idle';
      descriptionKey = 'noOpenIncidents';
      value = 0;
    }

    const signal: ResetSignal = {
      // Match the Worker and offline model's canonical source ID.
      source: 'status_page',
      label: 'OpenAI Status',
      status,
      value,
      description: descriptionKey,
      descriptionParams,
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

// Return the Worker snapshot when available, otherwise the local fallback.
export async function getDashboardInputs(simulatedSignals: ResetSignal[], force = false): Promise<DashboardInputs> {
  // Tier 1: server-side pipeline snapshot (most reliable)
  const pipeline = await fetchPipelineSnapshot(force);
  if (pipeline) {
    return {
      signals: pipeline.signals,
      hasRealData: true,
      generatedAt: pipeline.generatedAt,
      records: parsePipelineHistory(pipeline.history, pipeline.generatedAt),
    };
  }

  // In production, falling through to several third-party proxy/status hosts
  // makes a Worker outage slower and less reliable on constrained networks.
  // The local model is the honest, immediately usable fallback instead.
  if (PIPELINE_API_URL) return { signals: simulatedSignals, hasRealData: false, generatedAt: null, records: null };

  // Tier 2: direct browser fetch
  const realSignals = await fetchRealSignals();
  
  if (realSignals.length === 0) {
    // Fall back to simulated data if real fetch fails
    return { signals: simulatedSignals, hasRealData: false, generatedAt: null, records: null };
  }

  // Merge: use real data where available, simulated for missing sources
  const realSources = new Set(realSignals.map(s => s.source));
  const missingSignals = simulatedSignals.filter(s => !realSources.has(s.source));
  
  return {
    signals: [...realSignals, ...missingSignals], 
    hasRealData: true,
    generatedAt: Date.now(),
    records: null,
  };
}

/** Compatibility wrapper for non-dashboard callers. */
export async function getSignalsWithFallback(simulatedSignals: ResetSignal[]): Promise<{ signals: ResetSignal[]; hasRealData: boolean }> {
  const { signals, hasRealData } = await getDashboardInputs(simulatedSignals);
  return { signals, hasRealData };
}

function parsePipelineHistory(history: PipelineHistoryRow[] | undefined, generatedAt: number): ResetRecord[] | null {
  if (!history) return null;
  const records: ResetRecord[] = [];
  for (const row of history) {
    if (!row || typeof row.id !== 'string' || typeof row.reset_date !== 'string' || row.verified !== true) continue;
    const timestamp = Date.parse(row.reset_date);
    if (!Number.isFinite(timestamp) || timestamp > generatedAt + 5 * 60 * 1000) continue;
    records.push({
      id: row.id,
      date: new Date(timestamp).toISOString().slice(0, 10),
      timestamp,
      reason: 'verified reset',
      verified: true,
    });
  }
  return records;
}
