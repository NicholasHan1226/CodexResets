/**
 * The dashboard renders only a fresh pipeline snapshot. A Worker outage is a
 * visible unavailable state, never a locally recomputed production forecast.
 */

import { publicBankedNotices, type BankedNotice } from './banked-notices';
import type { ResetRecord, ResetSignal } from '@/types/reset';

const PIPELINE_API_URL = (import.meta.env.VITE_PIPELINE_API_URL || '').replace(/\/+$/, '');
const PIPELINE_TIMEOUT_MS = 3500;
export const PIPELINE_SNAPSHOT_MAX_AGE_MS = 90 * 60 * 1000;
const PIPELINE_SIGNAL_SOURCES = ['tibopost', 'status_page', 'cooldown'] as const;
const PIPELINE_SIGNAL_SOURCE_SET = new Set<string>(PIPELINE_SIGNAL_SOURCES);

interface PipelineSnapshot {
  bankedNotices?: BankedNotice[];
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
  bankedNotices?: BankedNotice[];
  /** Null when no fresh Worker snapshot is available. */
  signals: ResetSignal[] | null;
  hasRealData: boolean;
  /** Server snapshot creation time; null when the Worker is unavailable. */
  generatedAt: number | null;
  /** null means no verified history is available for a live forecast. */
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
 * beside locally generated substitutes. The pipeline owns these three sources;
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
  // The five-minute browser TTL must never extend the server freshness limit.
  if (cached && isFreshPipelineSnapshot(cached.generatedAt)) return cached;

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
    // A Pages deployment can briefly arrive before its paired Worker build.
    // Ignore the retired derived field during that bounded rollout window so
    // visitors keep the three independent signals rather than a false outage.
    const snapshotInput: Partial<PipelineSnapshot> = {
      ...data,
      signals: Array.isArray(data.signals)
        ? data.signals.filter((signal) => signal?.source !== 'launch_noise')
        : data.signals,
    };
    if (!isCompletePipelineSnapshot(snapshotInput)) return null;
    // Snapshot is refreshed every 30min server-side; cache for 5min locally
    const snapshot: PipelineSnapshot = {
      bankedNotices: publicBankedNotices(snapshotInput.bankedNotices),
      signals: snapshotInput.signals,
      generatedAt: snapshotInput.generatedAt,
      // Older deployed Workers do not have this field; a missing history will
      // be handled as an unavailable forecast by the caller.
      history: Array.isArray(snapshotInput.history) ? snapshotInput.history : undefined,
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

// Return a fresh Worker snapshot only. Do not replace an unavailable pipeline
// with bundled history or client-side proxy reads in production.
export async function getDashboardInputs(force = false): Promise<DashboardInputs> {
  // Tier 1: server-side pipeline snapshot (most reliable)
  const pipeline = await fetchPipelineSnapshot(force);
  if (pipeline) {
    return {
      bankedNotices: publicBankedNotices(pipeline.bankedNotices),
      signals: pipeline.signals,
      hasRealData: true,
      generatedAt: pipeline.generatedAt,
      records: parsePipelineHistory(pipeline.history, pipeline.generatedAt),
    };
  }

  return { signals: null, hasRealData: false, generatedAt: null, records: null };
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
