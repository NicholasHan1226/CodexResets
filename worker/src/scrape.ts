import type { Env, ScrapeResult, Tweet, ResetEvent } from './types';
import { decodeEntities, readJsonWithin, readTextWithin, stripTags } from './util';

const FETCH_TIMEOUT_MS = 8000;
const MAX_TWEETS = 15;
const MAX_EXTERNAL_TEXT_BYTES = 512 * 1024;
const MAX_OFFICIAL_JSON_BYTES = 64 * 1024;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Public nitter mirrors — availability rotates; the chain tolerates that.
const NITTER_INSTANCES = [
  'https://nitter.net',
  'https://nitter.poast.org',
  'https://nitter.privacydev.net',
  'https://xcancel.com',
  'https://nitter.tiekoetter.com',
  'https://nitter.1d4.us',
];

interface XApiResult {
  tweets: Tweet[];
  error?: string;
}

/**
 * Fetch the target account's recent posts. Strategy chain:
 *   1. authenticated X API (the only source allowed to confirm or deliver)
 *   2. RSSHub instances (discovery-only)
 *   3. nitter mirrors (discovery-only)
 *   4. Google News RSS (discovery-only)
 * Mirrors provide useful operational context, but never authoritative reset
 * evidence: a compromised mirror must not be able to create subscriber alerts.
 */
export async function scrapeTweets(env: Env): Promise<ScrapeResult> {
  const attempted: string[] = [];

  const official = await scrapeOfficialXTimeline(env);
  if (official.tweets.length > 0) {
    return { ok: true, instance: 'x-api', sourceKind: 'direct', tweets: official.tweets, attempted };
  }
  if (official.error) attempted.push(official.error);

  const rsshub = (env.RSSHUB_INSTANCES || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  for (const base of rsshub) {
    const url = `${base}/twitter/user/${env.TARGET_ACCOUNT}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'user-agent': 'codex-resets-pipeline/1.0 (+https://codexresets.cc)' },
      });
      if (!res.ok) {
        attempted.push(`${base}: HTTP ${res.status}`);
        continue;
      }
      const text = await readTextWithin(res, MAX_EXTERNAL_TEXT_BYTES);
      if (text === null) {
        attempted.push(`${base}: response too large`);
        continue;
      }
      const tweets = parseRssItems(text);
      if (tweets.length === 0) {
        attempted.push(`${base}: 0 items`);
        continue;
      }
      return { ok: true, instance: base, sourceKind: 'degraded', tweets, attempted };
    } catch (err) {
      attempted.push(`${base}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const base of NITTER_INSTANCES) {
    try {
      const res = await fetch(`${base}/${env.TARGET_ACCOUNT}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
      });
      if (!res.ok) {
        attempted.push(`${base}: HTTP ${res.status}`);
        continue;
      }
      const text = await readTextWithin(res, MAX_EXTERNAL_TEXT_BYTES);
      if (text === null) {
        attempted.push(`${base}: response too large`);
        continue;
      }
      const tweets = parseNitterHtml(text, base);
      if (tweets.length === 0) {
        attempted.push(`${base}: 0 items`);
        continue;
      }
      return { ok: true, instance: base, sourceKind: 'degraded', tweets, attempted };
    } catch (err) {
      attempted.push(`${base}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const news = await scrapeNewsMentions();
  if (news.length > 0) {
    return { ok: true, instance: 'google-news', sourceKind: 'degraded', tweets: news, attempted };
  }
  attempted.push('google-news: 0 items');

  return { ok: false, tweets: [], error: attempted.join(' | '), attempted };
}

/**
 * Prefer the authenticated X API when its app-only token is configured. The
 * public mirror chain remains discovery-only and never becomes trusted reset
 * evidence, including when the authenticated feed is unavailable.
 */
async function scrapeOfficialXTimeline(env: Env): Promise<XApiResult> {
  if (!env.X_BEARER_TOKEN) return { tweets: [] };
  const headers = { authorization: `Bearer ${env.X_BEARER_TOKEN}` };
  const cacheKey = `x-api:user:${env.TARGET_ACCOUNT.toLowerCase()}`;
  let userId = await env.CACHE.get(cacheKey);

  try {
    if (!userId) {
      const lookup = await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(env.TARGET_ACCOUNT)}`, {
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!lookup.ok) return { tweets: [], error: `x-api lookup: HTTP ${lookup.status}` };
      const body = await readJsonWithin<{ data?: { id?: string } }>(lookup, MAX_OFFICIAL_JSON_BYTES);
      if (!body) return { tweets: [], error: 'x-api lookup: invalid or oversized response' };
      userId = body.data?.id || '';
      if (!userId) return { tweets: [], error: 'x-api lookup: no user id' };
      await env.CACHE.put(cacheKey, userId, { expirationTtl: 30 * 24 * 60 * 60 });
    }

    const timeline = await fetch(
      // A repost can repeat reset wording from an unrelated account. It is not
      // an announcement authored by the target, so exclude it before the
      // automatic confirmation and delivery path sees the timeline.
      `https://api.x.com/2/users/${encodeURIComponent(userId)}/tweets?max_results=${MAX_TWEETS}&exclude=retweets&tweet.fields=created_at`,
      { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!timeline.ok) return { tweets: [], error: `x-api timeline: HTTP ${timeline.status}` };
    const body = await readJsonWithin<{ data?: Array<{ id?: string; text?: string; created_at?: string }> }>(timeline, MAX_OFFICIAL_JSON_BYTES);
    if (!body) return { tweets: [], error: 'x-api timeline: invalid or oversized response' };
    const tweets = (body.data || []).flatMap((post) => {
      const ts = Date.parse(post.created_at || '');
      if (!post.id || !post.text || Number.isNaN(ts)) return [];
      return [{ text: post.text, ts, link: `https://x.com/${env.TARGET_ACCOUNT}/status/${post.id}` }];
    }).sort((a, b) => b.ts - a.ts);
    return tweets.length > 0 ? { tweets } : { tweets: [], error: 'x-api timeline: 0 items' };
  } catch (error) {
    return { tweets: [], error: `x-api: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Degraded source: Google News RSS mentions of a Codex reset. */
export async function scrapeNewsMentions(): Promise<Tweet[]> {
  const url = 'https://news.google.com/rss/search?q=%22codex%22%20%22usage%20limits%22%20reset&hl=en-US&gl=US&ceid=US:en';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return [];
    const text = await readTextWithin(res, MAX_EXTERNAL_TEXT_BYTES);
    return text === null ? [] : parseRssItems(text);
  } catch {
    return [];
  }
}

/** Minimal RSS 2.0 item parser — enough for RSSHub / Google News feeds */
function parseRssItems(xml: string): Tweet[] {
  const items: Tweet[] = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const block of itemBlocks.slice(0, MAX_TWEETS)) {
    const title = tagText(block, 'title');
    const link = tagText(block, 'link');
    const pubDate = tagText(block, 'pubDate');
    const description = tagText(block, 'description');
    const ts = pubDate ? Date.parse(pubDate) : NaN;
    if (!link || Number.isNaN(ts)) continue;
    const text = decodeEntities(stripTags(title || description));
    if (!text) continue;
    items.push({ text, link, ts });
  }
  return items.sort((a, b) => b.ts - a.ts);
}

function tagText(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

// --- nitter HTML parsing -----------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseNitterHtml(html: string, base: string): Tweet[] {
  // Per-item blocks keep text/date/link aligned even when order shifts
  const blocks = html.split('<div class="timeline-item').slice(1);
  const tweets: Tweet[] = [];
  for (const block of blocks.slice(0, MAX_TWEETS)) {
    const linkM = block.match(/<span class="tweet-date">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*title="([^"]+)"/);
    const textM = block.match(/<div class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!linkM || !textM) continue;
    const ts = parseNitterDate(decodeEntities(linkM[2]));
    if (ts === null) continue;
    const href = linkM[1].startsWith('http') ? linkM[1] : `${base}${linkM[1]}`;
    const text = decodeEntities(stripTags(textM[1]));
    if (!text) continue;
    tweets.push({ text, link: href.replace(/#m$/, ''), ts });
  }
  return tweets.sort((a, b) => b.ts - a.ts);
}

/** "Aug 20, 2026 · 6:01 PM UTC" → epoch ms */
function parseNitterDate(title: string): number | null {
  const m = title.match(/(\w{3})\w*\s+(\d{1,2}),\s+(\d{4})[^0-9]*(\d{1,2}):(\d{2})\s*(AM|PM)\s*UTC/i);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase().slice(0, 3)];
  if (month === undefined) return null;
  let hour = Number(m[4]) % 12;
  if (m[6].toUpperCase() === 'PM') hour += 12;
  return Date.UTC(Number(m[3]), month, Number(m[2]), hour, Number(m[5]));
}

// Reset detection patterns — module scope so the signal builder shares them
export const RESET_RE = /\breset(s|ting)?\b/i;
// A generic "users" or "everyone" mention is not enough: it promoted launch
// updates and celebration posts to reset candidates. Keep the Codex/limit
// context explicit so a reset is about product access rather than any reset.
export const CONTEXT_RE = /(?:\bcodex\b|usage\s+limits?|rate\s+limits?|quota|credits?|banked\s+reset)/i;
// Announcement-style phrasing must assert that a reset became available.
// Precision matters more than recall: weak mentions remain visible in health,
// whereas a false inserted reset distorts the model for several days.
export const ANNOUNCE_RE = /(?:\b(?:usage\s+limits?|rate\s+limits?|quota|credits?)\s+(?:are|is|were|was|have|has|just)?\s*reset(?:ting)?\b|\b(?:banked\s+)?reset\s+(?:has|have|just)?\s*(?:landed|arrived|rolled(?:\s+out)?|gone\s+live|went\s+live|is\s+live|are\s+live)\b|\b(?:all|everyone)\s+(?:paid\s+)?users?\s+(?:should|have|has|can)\s+(?:now\s+)?(?:see|use|access|have)\b)/i;
const QUESTION_RE = /(?:\?|^\s*(?:when|will|would|can|does|do|how)\b)/i;
// A future-tense official post is useful public planning evidence, but is
// deliberately distinct from ANNOUNCE_RE: it must never create a reset
// record or delivery candidate before the reset has actually landed.
const SCHEDULED_RESET_RE = /\breset\s+(?:will|shall|is\s+(?:going\s+to|scheduled\s+to|expected\s+to))\s+(?:land|arrive|roll(?:\s+out)?|go\s+live)\b/i;
const RETRACTION_RE = /(?:\b(?:correction|incorrect|mistake|false\s+alarm)\b.{0,80}\b(?:reset|rollout|quota|limit)|\b(?:reset|rollout|quota|limit).{0,80}\b(?:was\s+not|wasn't|has\s+not|hasn't|did\s+not|didn't|delayed|postponed|rolled\s+back|reverted|cancelled)\b)/i;
const BANKED_RESET_RE = /\bbanked\s+reset\b/i;
const LIMIT_RESET_RE = /(?:usage|rate)\s+limits?/i;
const QUOTA_RESET_RE = /\bquota\b/i;
const CREDIT_RESET_RE = /\bcredits?\b/i;

export function isResetAnnouncement(text: string): boolean {
  return ANNOUNCE_RE.test(text) && !QUESTION_RE.test(text);
}

/** A future-tense reset schedule is a signal only, never an event candidate. */
export function isScheduledResetAnnouncement(text: string): boolean {
  return SCHEDULED_RESET_RE.test(text) && !QUESTION_RE.test(text);
}

/**
 * Parse the narrow, explicit form used in direct announcements such as
 * "Reset will land around 14pm PST tomorrow."  A schedule is only surfaced
 * when both its day and timezone are explicit; ambiguous wording stays a
 * schedule signal without inventing a target time.
 */
export function parseScheduledResetAt(text: string, postedAt: number): number | undefined {
  if (!isScheduledResetAnnouncement(text) || !/\btomorrow\b/i.test(text) || !Number.isFinite(postedAt)) return undefined;

  const match = text.match(/\b(?:at|around|by)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(PST|PDT)\b/i);
  if (!match) return undefined;

  const hourInput = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiemToken = match[3];
  // Without AM/PM, require an explicit minute field. This accepts unambiguous
  // 24-hour forms such as "14:30 PST" but still rejects vague "9 PST".
  if (!meridiemToken && match[2] === undefined) return undefined;
  if (!Number.isInteger(hourInput) || !Number.isInteger(minute) || hourInput > 23 || minute > 59) return undefined;

  const meridiem = meridiemToken?.replace(/\./g, '').toLowerCase();
  // Authors sometimes write "14pm". Interpret that unambiguously as 14:00,
  // while preserving ordinary 12-hour AM/PM notation.
  const hour = !meridiem
    ? hourInput
    : hourInput > 12
    ? hourInput
    : meridiem === 'pm'
      ? (hourInput % 12) + 12
      : hourInput % 12;
  const offsetHours = match[4].toUpperCase() === 'PDT' ? -7 : -8;
  const sourceLocal = new Date(postedAt + offsetHours * 60 * 60 * 1000);
  const targetLocalDate = new Date(Date.UTC(
    sourceLocal.getUTCFullYear(),
    sourceLocal.getUTCMonth(),
    sourceLocal.getUTCDate() + 1,
    hour,
    minute,
  ));
  return targetLocalDate.getTime() - offsetHours * 60 * 60 * 1000;
}

/** A later direct-source correction prevents pending automated delivery. */
export function isResetRetraction(text: string): boolean {
  return CONTEXT_RE.test(text) && RETRACTION_RE.test(text) && !QUESTION_RE.test(text);
}

type ResetTopic = 'banked' | 'limits' | 'quota' | 'credits' | 'general';

/**
 * Visitor-facing delivery type, derived only from the confirmed announcement
 * text. "Direct" means a directly available usage-limit reset, not merely a
 * direct-source fetch; the other labels retain the wording the announcement
 * made explicit.
 */
export type ResetNotificationType = 'banked' | 'direct' | 'quota' | 'credits';

export function classifyResetNotification(text: string): ResetNotificationType {
  if (BANKED_RESET_RE.test(text)) return 'banked';
  if (QUOTA_RESET_RE.test(text)) return 'quota';
  if (CREDIT_RESET_RE.test(text)) return 'credits';
  return 'direct';
}

function resetTopic(text: string): ResetTopic {
  if (BANKED_RESET_RE.test(text)) return 'banked';
  if (LIMIT_RESET_RE.test(text)) return 'limits';
  if (QUOTA_RESET_RE.test(text)) return 'quota';
  if (CREDIT_RESET_RE.test(text)) return 'credits';
  return 'general';
}

/** Avoid withdrawing an unrelated pending notice just because both mention a reset. */
export function isRetractionForCandidate(candidate: ResetEvent, correction: ResetEvent): boolean {
  if (!isResetRetraction(correction.text)) return false;
  const candidateTopic = resetTopic(candidate.text);
  const correctionTopic = resetTopic(correction.text);
  return candidateTopic === correctionTopic;
}

/** Older social posts are history, not a fresh alert. Future timestamps are rejected too. */
export function isTimelyAutomatedCandidate(event: ResetEvent, now = Date.now(), maxAgeMs = 48 * 60 * 60 * 1000): boolean {
  return event.ts <= now && now - event.ts <= maxAgeMs;
}

export interface ResetDetection {
  /** reset + context + announcement phrasing — safe to auto-insert */
  strong: ResetEvent[];
  /** reset + context only — logged for manual review, never auto-inserted */
  weak: ResetEvent[];
}

/**
 * Detect reset announcements. Every verified historical reset came from a
 * post mentioning a reset, so require "reset" plus a usage-limit context
 * word; auto-insert additionally requires announcement-style phrasing.
 * Precision beats recall here: a missed reset self-corrects via the news
 * fallback and the next mention, while a false reset corrupts the
 * prediction model for days.
 */
export function detectResetEvents(tweets: Tweet[]): ResetDetection {
  const toEvent = (t: Tweet): ResetEvent => ({ ts: t.ts, text: t.text.slice(0, 280), link: t.link });
  const matched = tweets.filter((t) => RESET_RE.test(t.text) && CONTEXT_RE.test(t.text));
  return {
    strong: matched.filter((t) => isResetAnnouncement(t.text)).map(toEvent),
    weak: matched.filter((t) => !isResetAnnouncement(t.text)).map(toEvent),
  };
}

export function detectResetRetractions(tweets: Tweet[]): ResetEvent[] {
  return tweets
    .filter((tweet) => isResetRetraction(tweet.text))
    .map((tweet) => ({ ts: tweet.ts, text: tweet.text.slice(0, 280), link: tweet.link }));
}
