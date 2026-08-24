import type { Env } from './types';
import { readJsonWithin } from './util';

const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_RESULTS = 25;
const HOUR = 60 * 60 * 1000;
const COMMUNITY_WINDOW_MS = 6 * HOUR;
const MIN_DISTINCT_AUTHORS = 3;
const MIN_DISTINCT_REPORTS = 3;

/**
 * Aggregate-only public-post evidence around an exact direct official
 * schedule. This is deliberately corroboration, not a reset source: raw
 * posts, authors, links, and text fingerprints never leave this function.
 */
export interface CommunityCorroboration {
  availability: 'live' | 'unavailable';
  matchedPosts: number;
  distinctAuthors: number;
  corroborated: boolean;
}

interface XSearchPost {
  id?: string;
  text?: string;
  created_at?: string;
  author_id?: string;
}

interface XSearchResponse {
  data?: XSearchPost[];
}

// Keep replies: users often report a completed reset under the official post.
// Retweets are still excluded so one original claim cannot be amplified into
// the independent-account threshold.
const COMMUNITY_QUERY = '(Codex OR "额度重置" OR "额度恢复") (reset OR "usage limit" OR quota OR 重置 OR 恢复) -is:retweet';
const CODEX_CONTEXT_RE = /(?:\bcodex\b|额度|quota|usage\s+limits?|rate\s+limits?)/i;
const RESET_OUTCOME_RE = /(?:\b(?:codex\s+)?(?:usage\s+limits?|rate\s+limits?|quota|credits?)\s+(?:are|is|got|just)?\s*(?:back|reset|restored|available)\b|\breset\s+(?:just\s+)?(?:landed|arrived|hit|happened|went\s+live|is\s+live)\b|\b(?:got|received)\s+(?:my\s+)?(?:codex\s+)?(?:reset|quota|credits?)\b|(?:额度|限额).{0,12}(?:重置|恢复|回来了|到账)|(?:重置|恢复).{0,12}(?:额度|限额|codex))/i;
const NON_OUTCOME_RE = /(?:\?|？|\b(?:when|will|tomorrow|expected|should|maybe|hope|please|predict(?:ion)?)\b|(?:什么时候|明天|预计|希望|会不会|预测))/i;

/**
 * Queries X Recent Search only after an official schedule becomes due. Three
 * distinct authors and three independently worded outcome reports are needed
 * before this is considered corroborated. An unavailable API is fail-closed
 * and does not alter the official schedule or confirmation paths.
 */
export async function findCommunityResetCorroboration(
  env: Env,
  scheduledAt: number,
  now = Date.now(),
): Promise<CommunityCorroboration> {
  const unavailable: CommunityCorroboration = {
    availability: 'unavailable', matchedPosts: 0, distinctAuthors: 0, corroborated: false,
  };
  if (!env.X_BEARER_TOKEN || !Number.isFinite(scheduledAt) || scheduledAt > now || now - scheduledAt > COMMUNITY_WINDOW_MS) {
    return unavailable;
  }

  const url = new URL('https://api.x.com/2/tweets/search/recent');
  url.searchParams.set('query', COMMUNITY_QUERY);
  url.searchParams.set('max_results', String(MAX_RESULTS));
  url.searchParams.set('tweet.fields', 'created_at,author_id');
  url.searchParams.set('start_time', new Date(scheduledAt).toISOString());
  url.searchParams.set('end_time', new Date(Math.min(now, scheduledAt + COMMUNITY_WINDOW_MS)).toISOString());

  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${env.X_BEARER_TOKEN}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return unavailable;
    const body = await readJsonWithin<XSearchResponse>(res, MAX_RESPONSE_BYTES);
    if (!body) return unavailable;

    const authors = new Set<string>();
    const fingerprints = new Set<string>();
    for (const post of body.data || []) {
      const timestamp = Date.parse(post.created_at || '');
      const text = post.text || '';
      if (!post.author_id || !text || !Number.isFinite(timestamp)) continue;
      if (timestamp < scheduledAt || timestamp > now || timestamp > scheduledAt + COMMUNITY_WINDOW_MS) continue;
      if (!CODEX_CONTEXT_RE.test(text) || !RESET_OUTCOME_RE.test(text) || NON_OUTCOME_RE.test(text)) continue;
      const fingerprint = normalizeReport(text);
      if (!fingerprint || fingerprints.has(fingerprint)) continue;
      fingerprints.add(fingerprint);
      authors.add(post.author_id);
    }
    const matchedPosts = fingerprints.size;
    const distinctAuthors = authors.size;
    return {
      availability: 'live',
      matchedPosts,
      distinctAuthors,
      corroborated: matchedPosts >= MIN_DISTINCT_REPORTS && distinctAuthors >= MIN_DISTINCT_AUTHORS,
    };
  } catch {
    return unavailable;
  }
}

/** Comparable wording only; it is never persisted or exposed. */
function normalizeReport(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/@\w+/g, '')
    .replace(/[\p{P}\p{S}\s]+/gu, ' ')
    .trim()
    .slice(0, 240);
}
