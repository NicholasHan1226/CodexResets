import type { Env, ScrapeResult, Tweet, ResetEvent } from './types';
import { decodeEntities, stripTags } from './util';

const FETCH_TIMEOUT_MS = 8000;
const MAX_TWEETS = 15;

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

/**
 * Fetch the target account's recent posts. Strategy chain:
 *   1. RSSHub instances (public ones mostly dropped the twitter route, but
 *      a self-hosted instance with X credentials plugged into
 *      RSSHUB_INSTANCES makes this primary again)
 *   2. nitter mirrors (HTML scrape)
 *   3. Google News RSS (a degraded, but independently reachable source)
 * Every failed primary attempt is retained for diagnosis. A populated fallback
 * is still a successful collection run, so transient mirror churn does not
 * make the production health endpoint fail closed.
 */
export async function scrapeTweets(env: Env): Promise<ScrapeResult> {
  const attempted: string[] = [];

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
      const tweets = parseRssItems(await res.text());
      if (tweets.length === 0) {
        attempted.push(`${base}: 0 items`);
        continue;
      }
      return { ok: true, instance: base, sourceKind: 'direct', tweets, attempted };
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
      const tweets = parseNitterHtml(await res.text(), base);
      if (tweets.length === 0) {
        attempted.push(`${base}: 0 items`);
        continue;
      }
      return { ok: true, instance: base, sourceKind: 'direct', tweets, attempted };
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

/** Degraded source: Google News RSS mentions of a Codex reset. */
export async function scrapeNewsMentions(): Promise<Tweet[]> {
  const url = 'https://news.google.com/rss/search?q=%22codex%22%20%22usage%20limits%22%20reset&hl=en-US&gl=US&ceid=US:en';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return [];
    return parseRssItems(await res.text());
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
const RETRACTION_RE = /(?:\b(?:correction|incorrect|mistake|false\s+alarm)\b.{0,80}\b(?:reset|rollout|quota|limit)|\b(?:reset|rollout|quota|limit).{0,80}\b(?:was\s+not|wasn't|has\s+not|hasn't|did\s+not|didn't|delayed|postponed|rolled\s+back|reverted|cancelled)\b)/i;

export function isResetAnnouncement(text: string): boolean {
  return ANNOUNCE_RE.test(text) && !QUESTION_RE.test(text);
}

/** A later direct-source correction prevents pending automated delivery. */
export function isResetRetraction(text: string): boolean {
  return CONTEXT_RE.test(text) && RETRACTION_RE.test(text) && !QUESTION_RE.test(text);
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
