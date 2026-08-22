import type { Env } from './types';
import { decodeEntities, stripTags } from './util';

const OFFICIAL_CODEX_CHANGELOG_URL = 'https://help.openai.com/en/articles/11428266-codex-changelog';
const CACHE_KEY = 'official-discovery:codex-changelog';
const CACHE_TTL_SECONDS = 6 * 60 * 60;

export interface OfficialDiscoveryStatus {
  checkedAt: string;
  reachable: boolean;
  resetContextFound: boolean;
  lastModified: string | null;
}

function parseStatus(raw: string | null): OfficialDiscoveryStatus | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OfficialDiscoveryStatus>;
    return typeof parsed.checkedAt === 'string'
      && typeof parsed.reachable === 'boolean'
      && typeof parsed.resetContextFound === 'boolean'
      ? { checkedAt: parsed.checkedAt, reachable: parsed.reachable, resetContextFound: parsed.resetContextFound, lastModified: typeof parsed.lastModified === 'string' ? parsed.lastModified : null }
      : null;
  } catch {
    return null;
  }
}

/**
 * Reads an OpenAI-owned Codex update page as discovery context only. Its
 * contents never become Tweet candidates, never lift the forecast, and never
 * enter the confirmation or notification path.
 */
export async function refreshOfficialCodexDiscovery(env: Env): Promise<OfficialDiscoveryStatus> {
  const existing = await getOfficialCodexDiscovery(env);
  if (existing && Date.now() - Date.parse(existing.checkedAt) < CACHE_TTL_SECONDS * 1000) return existing;
  try {
    const response = await fetch(OFFICIAL_CODEX_CHANGELOG_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = decodeEntities(stripTags((await response.text()).slice(0, 300_000)));
    const status: OfficialDiscoveryStatus = {
      checkedAt: new Date().toISOString(),
      reachable: true,
      resetContextFound: /\bcodex\b/i.test(text) && /(?:usage|rate)\s+limits?|banked\s+reset|\breset\b/i.test(text),
      lastModified: response.headers.get('last-modified'),
    };
    await env.CACHE.put(CACHE_KEY, JSON.stringify(status), { expirationTtl: CACHE_TTL_SECONDS });
    return status;
  } catch {
    const status: OfficialDiscoveryStatus = {
      checkedAt: new Date().toISOString(),
      reachable: false,
      resetContextFound: false,
      lastModified: null,
    };
    await env.CACHE.put(CACHE_KEY, JSON.stringify(status), { expirationTtl: CACHE_TTL_SECONDS });
    return status;
  }
}

export async function getOfficialCodexDiscovery(env: Env): Promise<OfficialDiscoveryStatus | null> {
  return parseStatus(await env.CACHE.get(CACHE_KEY));
}
