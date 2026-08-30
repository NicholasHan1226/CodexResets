import type { Env, ScrapeResult, Tweet, ResetEvent } from './types';
import { decodeEntities, readJsonWithin, readTextWithin, stripTags } from './util';

const FETCH_TIMEOUT_MS = 8000;
const MAX_TWEETS = 15;
const MAX_EXTERNAL_TEXT_BYTES = 512 * 1024;
const MAX_OFFICIAL_JSON_BYTES = 2 * 1024 * 1024;
const OFFICIAL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const OFFICIAL_PAGE_SIZE = 50;
const MAX_OFFICIAL_PAGES = 8;
const MAX_CACHED_POSTS = 1000;
const MAX_CONTEXT_REPLIES = 20;
const MAX_CONTEXT_ATTEMPTS = 3;

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
  contextPending?: number;
  contextUnavailable?: number;
}

interface XPost {
  id?: string;
  author_id?: string;
  text?: string;
  created_at?: string;
  note_tweet?: { text?: string };
  note_post?: { text?: string };
  referenced_tweets?: { type: string; id: string }[];
  referenced_posts?: { type: string; id: string }[];
}

interface XPage {
  data?: XPost[];
  includes?: { tweets?: XPost[]; posts?: XPost[] };
  meta?: { next_token?: string; newest_id?: string };
  errors?: unknown[];
}

interface TimelineCache {
  sinceId?: string;
  checkedAt: number;
  tweets: Tweet[];
  contextVersion?: 1;
  pendingReplies?: { id: string; attempts: number; historyOnly: boolean }[];
}

const X_FIELDS = 'author_id,created_at,note_tweet,referenced_tweets';
async function fetchOfficialPage(url: URL, headers: Record<string, string>): Promise<Response> {
  url.searchParams.set('tweet.fields', X_FIELDS);
  url.searchParams.set('expansions', 'referenced_tweets.id');
  let response = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (response.status === 400) {
    await response.body?.cancel();
    url.searchParams.delete('tweet.fields');
    url.searchParams.set('post.fields', 'author_id,created_at,note_post,referenced_posts');
    url.searchParams.set('expansions', 'referenced_posts.id');
    response = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  }
  return response;
}

function needsReplyContext(text: string): boolean {
  return isAffirmativeResetReply(text) || /\b(?:button\b.*\bpressed|reset\s+(?:has\s+)?landed)\b/i.test(text);
}

function contextualizePost(post: XPost, parents: XPost[], userId: string, account: string, historyOnly: boolean): { tweet: Tweet; missingContext: boolean } {
  const text = post.note_tweet?.text || post.note_post?.text || post.text || '';
  const ts = Date.parse(post.created_at || '');
  const refs = post.referenced_tweets || post.referenced_posts || [];
  const parentId = refs.find((ref) => ref.type === 'replied_to' || ref.type === 'quoted')?.id;
  const parent = parents.find((item) => item.id === parentId);
  const parentText = parent?.note_tweet?.text || parent?.note_post?.text || parent?.text;
  const parentTs = Date.parse(parent?.created_at || '');
  const parentComplete = Boolean(parentText && parent?.author_id && Number.isFinite(parentTs));
  const parentIsTimely = parentComplete && parentTs <= ts && ts - parentTs <= 48 * 3600_000;
  return {
    tweet: {
      text, ts, link: `https://x.com/${account}/status/${post.id}`, historyOnly,
      ...(parentIsTimely && parent?.author_id === userId ? { officialParentText: parentText } : {}),
      // Community text and identities never enter the private evidence cache.
      ...(parentIsTimely && parentText && isGlobalResetReport(parentText)
        && isAffirmativeResetReply(text) ? { replyConfirmsGlobalReset: true } : {}),
    },
    missingContext: Boolean(parentId && !parentComplete && needsReplyContext(text) && !isResetAnnouncement(text)),
  };
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
  if (!official.error && env.X_BEARER_TOKEN) {
    return { ok: true, instance: 'x-api', sourceKind: 'direct', tweets: official.tweets, attempted,
      contextPending: official.contextPending, contextUnavailable: official.contextUnavailable };
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

    const now = Date.now();
    const timelineKey = `x-api:timeline:v2:${env.TARGET_ACCOUNT.toLowerCase()}`;
    const raw = await env.CACHE.get(timelineKey);
    let cached: TimelineCache | undefined;
    if (raw) {
      const parsed = JSON.parse(raw) as TimelineCache;
      if (Array.isArray(parsed.tweets) && Number.isFinite(parsed.checkedAt)
        && now - parsed.checkedAt < OFFICIAL_LOOKBACK_MS && parsed.checkedAt <= now) cached = parsed;
    }
    const collected: Tweet[] = [];
    const pending = new Map((cached?.pendingReplies || []).map((reply) => [reply.id, reply]));
    let contextUnavailable = 0;
    // One-time upgrade of the old cache: recover only context-dependent
    // official replies, history-only, without rereading the entire timeline.
    if (cached && cached.contextVersion !== 1) {
      for (const tweet of cached.tweets.filter((item) => needsReplyContext(item.text) && !isResetTweet(item))) {
        const id = tweet.link.match(/\/status\/(\d+)$/)?.[1];
        if (id) pending.set(id, { id, attempts: 0, historyOnly: true });
      }
    }
    let nextToken: string | undefined;
    let newestId = cached?.sinceId;
    for (let page = 0; page < MAX_OFFICIAL_PAGES; page++) {
      const url: URL = new URL(`https://api.x.com/2/users/${encodeURIComponent(userId)}/tweets`);
      url.searchParams.set('max_results', String(OFFICIAL_PAGE_SIZE));
      url.searchParams.set('exclude', 'retweets');
      if (cached?.sinceId) url.searchParams.set('since_id', cached.sinceId);
      else url.searchParams.set('start_time', new Date(now - OFFICIAL_LOOKBACK_MS).toISOString());
      if (nextToken) url.searchParams.set('pagination_token', nextToken);
      const timeline = await fetchOfficialPage(url, headers);
      if (!timeline.ok) return { tweets: [], error: `x-api timeline: HTTP ${timeline.status}` };
      const body: XPage | null = await readJsonWithin<XPage>(timeline, MAX_OFFICIAL_JSON_BYTES);
      if (!body || (!Array.isArray(body.data) && !body.meta) || (body.errors?.length && !body.data)) {
        return { tweets: [], error: 'x-api timeline: invalid or incomplete response' };
      }
      const parents = [...(body.includes?.tweets || []), ...(body.includes?.posts || [])];
      for (const post of body.data || []) {
        const ts = Date.parse(post.created_at || '');
        const text = post.note_tweet?.text || post.note_post?.text || post.text;
        if (!post.id || !text || !Number.isFinite(ts) || ts > now) {
          return { tweets: [], error: 'x-api timeline: incomplete post; watermark retained' };
        }
        if (post.author_id && post.author_id !== userId) continue;
        const refs = post.referenced_tweets || post.referenced_posts || [];
        if (refs.some((ref) => ref.type === 'retweeted')) continue;
        const { tweet, missingContext } = contextualizePost(post, parents, userId, env.TARGET_ACCOUNT, !cached || now - ts > 48 * 3600_000);
        collected.push(tweet);
        if (missingContext) pending.set(post.id, pending.get(post.id) || { id: post.id, attempts: 0, historyOnly: Boolean(tweet.historyOnly) });
        else pending.delete(post.id);
        if (/^\d+$/.test(post.id) && (!newestId || BigInt(post.id) > BigInt(newestId))) newestId = post.id;
      }
      nextToken = body.meta?.next_token;
      if (!nextToken) break;
    }
    // Never advance a watermark after a failed/truncated page sequence.
    if (nextToken) return { tweets: [], error: 'x-api timeline: pagination bound reached; watermark retained' };
    // The timeline watermark may advance because unresolved replies have an
    // explicit bounded retry queue. One extra batch, <=20 official post IDs,
    // <=3 attempts each; a deleted/protected parent never blocks the feed.
    const retries = [...pending.values()].slice(0, MAX_CONTEXT_REPLIES);
    for (const overflow of [...pending.values()].slice(MAX_CONTEXT_REPLIES)) {
      pending.delete(overflow.id);
      contextUnavailable++;
    }
    if (retries.length) {
      let retryBody: XPage | null = null;
      try {
        const url = new URL('https://api.x.com/2/tweets');
        url.searchParams.set('ids', retries.map((item) => item.id).join(','));
        const response = await fetchOfficialPage(url, headers);
        if (response.ok) retryBody = await readJsonWithin<XPage>(response, MAX_OFFICIAL_JSON_BYTES);
        else await response.body?.cancel();
      } catch { /* unresolved IDs remain in the bounded retry queue */ }
      for (const retry of retries) {
        const post = retryBody?.data?.find((item) => item.id === retry.id && item.author_id === userId);
        if (post?.text && Number.isFinite(Date.parse(post.created_at || '')) && Date.parse(post.created_at!) <= now) {
          const result = contextualizePost(post, [...(retryBody?.includes?.tweets || []), ...(retryBody?.includes?.posts || [])], userId, env.TARGET_ACCOUNT,
            retry.historyOnly || now - Date.parse(post.created_at!) > 48 * 3600_000);
          if (!result.missingContext) {
            collected.push(result.tweet);
            pending.delete(retry.id);
            continue;
          }
        }
        if (retry.attempts + 1 >= MAX_CONTEXT_ATTEMPTS) {
          pending.delete(retry.id);
          contextUnavailable++;
        } else pending.set(retry.id, { ...retry, attempts: retry.attempts + 1 });
      }
    }
    const tweets = [...new Map([...(cached?.tweets || []), ...collected].map((tweet) => [tweet.link, tweet])).values()]
      .filter((tweet) => tweet.ts >= now - OFFICIAL_LOOKBACK_MS && tweet.ts <= now)
      .sort((a, b) => b.ts - a.ts);
    if (tweets.length > MAX_CACHED_POSTS) return { tweets: [], error: 'x-api timeline: cache bound reached; watermark retained' };
    await env.CACHE.put(timelineKey, JSON.stringify({ sinceId: newestId, checkedAt: now, tweets, contextVersion: 1, pendingReplies: [...pending.values()] }), { expirationTtl: 8 * 24 * 3600 });
    return { tweets, contextPending: pending.size, contextUnavailable };
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
export const RESET_RE = /\breset(?:s|t?ing|ed)?\b/i;
// A generic "users" or "everyone" mention is not enough: it promoted launch
// updates and celebration posts to reset candidates. Keep the Codex/limit
// context explicit so a reset is about product access rather than any reset.
export const CONTEXT_RE = /(?:\bcodex\b|\bchatgpt\s+work\b|\busage\b|rate\s+limits?|quota|credits?|banked\s+reset)/i;
// Announcement-style phrasing must assert that a reset became available.
// Precision matters more than recall: weak mentions remain visible in health,
// whereas a false inserted reset distorts the model for several days.
export const ANNOUNCE_RE = /(?:\b(?:usage(?:\s+limits?)?|(?:codex|rate)\s+limits?|quota|credits?)\s+(?:(?:are|is|were|was|have|has|been|just|now)\s+)*reset\b|\b(?:i|we)(?:'ve)?\s+(?:(?:have|has|are|am|just|now)\s+)*reset(?:t?ing)?\s+(?:(?:the|all|your|everyone's|codex)\s+)*(?:usage|limits?|rate\s+limits?|quota|credits?)\b|\b(?:banked\s+)?reset\s+(?:(?:has|have|been|was|is|just|now)\s+)*(?:landed|arrived|propagated|rolled\s+out|gone\s+live|went\s+live|live)\b|\b(?:added|credited|given)\b[^.!?\n]{0,80}\bbanked\s+resets?\b|\b(?:brand\s+)?new\s+usage\s+for\s+(?:all\s+)?(?:paid\s+)?(?:chatgpt\s+work|codex)\b)/i;
const NON_EXECUTION_RE = /\b(?:not|never|hasn't|haven't|isn't|wasn't|didn't|don't|won't|will|would|could|might|maybe|if|tomorrow|going\s+to|plan\s+to|scheduled\s+to|expected\s+to|hope|wish)\b/i;
const QUESTION_RE = /(?:\?|^\s*(?:when|will|would|can|does|do|how)\b)/i;
// A future-tense official post is useful public planning evidence, but is
// deliberately distinct from ANNOUNCE_RE: it must never create a reset
// record or delivery candidate before the reset has actually landed.
const SCHEDULED_RESET_RE = /(?:\breset\s+(?:will|shall|is\s+(?:going\s+to|scheduled\s+to|expected\s+to))\s+(?:land|arrive|roll(?:\s+out)?|go\s+live)\b|\b(?:i|we)(?:'ll|\s+(?:will|shall|are\s+going\s+to))\s+reset\b|\b(?:usage|limits?|quota)\b[^.!?\n]{0,40}\bwill\s+be\s+reset\b)/i;
// Official authors also discuss individual support cases and test runs. Those
// assertions must never become a global reset, even when the verbs match.
const LIMITED_SCOPE_RE = /(?:\b(?:test(?:ing)?|staging|sandbox|development|internal)\s+(?:environment|accounts?|users?|only|run)|\b(?:in|on)\s+(?:our\s+|the\s+)?(?:test|staging|sandbox)\b|\b(?:one|a\s+single|a|an|some|few|several|selected|specific|individual|my|your|this|that)\s+(?:(?:affected|codex|test|paid)\s+)*(?:accounts?|users?|customers?)\b|\b(?:only|just)\s+(?:for\s+)?(?:pro|plus|free|team|enterprise)\b)/i;

function assertionSentences(text: string): string[] {
  return text.replace(/[’‘]/g, "'").replace(/\b([ap])\.m\./gi, '$1m').split(/(?<=[.!?])\s+|\n+/);
}
const RETRACTION_RE = /(?:\b(?:correction|incorrect|mistake|false\s+alarm)\b.{0,80}\b(?:reset|rollout|quota|limit)|\b(?:reset|rollout|quota|limit).{0,80}\b(?:was\s+not|wasn't|has\s+not|hasn't|did\s+not|didn't|delayed|postponed|rolled\s+back|reverted|cancelled)\b)/i;
const BANKED_RESET_RE = /\bbanked\s+resets?\b/i;
const LIMIT_RESET_RE = /(?:usage|rate)\s+limits?/i;
const QUOTA_RESET_RE = /\bquota\b/i;
const CREDIT_RESET_RE = /\bcredits?\b/i;

export function isResetAnnouncement(text: string): boolean {
  const normalized = text.replace(/[’‘]/g, "'");
  if (!CONTEXT_RE.test(normalized) || isResetRetraction(normalized)) return false;
  // Judge the assertion sentence, not punctuation or future plans in the
  // rest of a long post. A later FAQ must not cancel an actual announcement.
  return assertionSentences(normalized).some((sentence) => (
    ANNOUNCE_RE.test(sentence) && !QUESTION_RE.test(sentence) && !NON_EXECUTION_RE.test(sentence)
      && !LIMITED_SCOPE_RE.test(sentence)
      && !/\b(?:every\s+(?:week|day|month)|usually|normally|typically)\b/i.test(sentence)
  ));
}

function isAffirmativeResetReply(text: string): boolean {
  return /^(?:@\w+\s+)*(?:ah\s+)?(?:yes|yeah|yep|correct|indeed)\b/i.test(text.trim())
    && !LIMITED_SCOPE_RE.test(text)
    && !/\?|\b(?:not|no|tomorrow|will|maybe|but)\b/i.test(text);
}

function isGlobalResetReport(text: string): boolean {
  return CONTEXT_RE.test(text) && /\b(?:all|everyone|paid\s+users)\b/i.test(text)
    && RESET_RE.test(text) && /\b(?:reset|back\s+to\s+100%)\b/i.test(text)
    && !LIMITED_SCOPE_RE.test(text) && !QUESTION_RE.test(text)
    && !/\b(?:will|tomorrow|might|not|hasn't)\b/i.test(text);
}

export function isResetTweet(tweet: Tweet): boolean {
  if (isResetAnnouncement(tweet.text)) return true;
  if (tweet.replyConfirmsGlobalReset && isAffirmativeResetReply(tweet.text)) return true;
  return Boolean(tweet.officialParentText && CONTEXT_RE.test(tweet.officialParentText)
    && !LIMITED_SCOPE_RE.test(tweet.officialParentText) && !LIMITED_SCOPE_RE.test(tweet.text)
    && /\b(?:button\s+(?:was\s+|has\s+been\s+)?(?:already\s+)?pressed|reset\s+(?:has\s+)?landed)\b/i.test(tweet.text)
    && !/\?|\b(?:not|will|hasn't|never)\b/i.test(tweet.text));
}

/** A future-tense reset schedule is a signal only, never an event candidate. */
export function isScheduledResetAnnouncement(text: string): boolean {
  return assertionSentences(text).some((sentence) => SCHEDULED_RESET_RE.test(sentence)
    && (CONTEXT_RE.test(text) || /^\s*reset\s/i.test(sentence))
    && !QUESTION_RE.test(sentence) && !LIMITED_SCOPE_RE.test(sentence)
    && !/\b(?:not|never|won't|might|maybe|if|cancelled|canceled|postponed)\b/i.test(sentence));
}

/**
 * Parse explicit relative/calendar days with an explicit timezone. PT/ET
 * follow daylight saving; literal PST/PDT retain their stated fixed offset.
 * Missing or ambiguous days/zones remain untimed, never guessed.
 */
export function parseScheduledResetAt(text: string, postedAt: number): number | undefined {
  if (!Number.isFinite(postedAt)) return undefined;
  const sentence = assertionSentences(text).find(isScheduledResetAnnouncement);
  if (!sentence) return undefined;

  const match = sentence.match(/\b(?:at|around|by)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(PST|PDT|PT|EST|EDT|ET|UTC|GMT)\b/i);
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
  if (meridiem && (hourInput === 0 || (hourInput > 12 && meridiem !== 'pm'))) return undefined;
  const zone = match[4].toUpperCase();
  const offsetMap: Record<string, number> = { PST: -8, PDT: -7, EST: -5, EDT: -4, UTC: 0, GMT: 0 };
  const ianaZone = zone === 'PT' ? 'America/Los_Angeles' : zone === 'ET' ? 'America/New_York' : null;
  const localParts = (at: number) => {
    if (!ianaZone) {
      const date = new Date(at + offsetMap[zone] * 3600_000);
      return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes()];
    }
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: ianaZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(at);
    return ['year', 'month', 'day', 'hour', 'minute'].map((key) => Number(parts.find((part) => part.type === key)?.value));
  };
  const [year, month, day] = localParts(postedAt);
  let targetDay = Date.UTC(year, month - 1, day);
  const explicitDate = sentence.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (explicitDate) {
    targetDay = Date.UTC(Number(explicitDate[1]), Number(explicitDate[2]) - 1, Number(explicitDate[3]));
    if (new Date(targetDay).toISOString().slice(0, 10) !== explicitDate[0]) return undefined;
  } else if (/\btomorrow\b/i.test(sentence)) targetDay += 86400_000;
  else if (!/\btoday\b/i.test(sentence)) {
    const weekday = sentence.match(/\b(?:on\s+|next\s+)(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i);
    if (!weekday) return undefined;
    const dayIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(weekday[1].toLowerCase());
    const delta = (dayIndex - new Date(targetDay).getUTCDay() + 7) % 7;
    // "next Monday" on Monday is next week; bare "on Monday" is today.
    targetDay += (delta || (/next/i.test(weekday[0]) ? 7 : 0)) * 86400_000;
  }
  const localTarget = targetDay + (hour * 60 + minute) * 60_000;
  const offsets = ianaZone ? (zone === 'PT' ? [-8, -7] : [-5, -4]) : [offsetMap[zone]];
  const matches = offsets.map((offset) => localTarget - offset * 3600_000).filter((at) => {
    const [y, m, d, h, min] = localParts(at);
    return Date.UTC(y, m - 1, d, h, min) === localTarget;
  });
  return matches.length === 1 ? matches[0] : undefined;
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
  // Full long-post text may discuss unrelated banked resets or credits later.
  // Classify the actual assertion, not an incidental FAQ paragraph.
  const assertion = text.split(/(?<=[.!?])\s+|\n+/).find(isResetAnnouncement) || text;
  if (BANKED_RESET_RE.test(assertion)) return 'banked';
  if (QUOTA_RESET_RE.test(assertion)) return 'quota';
  if (CREDIT_RESET_RE.test(assertion)) return 'credits';
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
 * Detect completed/in-progress official assertions, including long posts and
 * context-bound replies. Mirrors remain discovery-only at the pipeline gate.
 */
export function detectResetEvents(tweets: Tweet[]): ResetDetection {
  const toEvent = (t: Tweet): ResetEvent => ({ ts: t.ts, text: t.text, link: t.link, ...(t.historyOnly ? { historyOnly: true } : {}) });
  return {
    strong: tweets.filter(isResetTweet).map(toEvent),
    weak: tweets.filter((t) => !isResetTweet(t) && RESET_RE.test(t.text) && CONTEXT_RE.test(t.text)).map(toEvent),
  };
}

export function detectResetRetractions(tweets: Tweet[]): ResetEvent[] {
  return tweets
    .filter((tweet) => isResetRetraction(tweet.text))
    .map((tweet) => ({ ts: tweet.ts, text: tweet.text.slice(0, 280), link: tweet.link }));
}
