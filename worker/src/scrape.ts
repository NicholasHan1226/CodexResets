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
 * Every attempt's error is collected so /api/health shows the full picture.
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
      return { ok: true, instance: base, tweets, attempted };
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
      return { ok: true, instance: base, tweets, attempted };
    } catch (err) {
      attempted.push(`${base}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { ok: false, tweets: [], error: attempted.join(' | '), attempted };
}

/** Fallback signal source: Google News RSS mentions of a codex reset.
 *  Not a substitute for the primary source, but catches widely-reported
 *  resets when every tweet mirror is down. */
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

/**
 * Detect reset announcements. Every verified historical reset came from a
 * post mentioning a reset, so require "reset" plus a usage-limit context
 * word to avoid "reset my password" style noise.
 */
export function detectResetEvents(tweets: Tweet[]): ResetEvent[] {
  const RESET_RE = /\breset(s|ting)?\b/i;
  const CONTEXT_RE = /(limit|usage|quota|credit|paid|users?|codex|weekly|bank|everyone)/i;
  return tweets
    .filter((t) => RESET_RE.test(t.text) && CONTEXT_RE.test(t.text))
    .map((t) => ({ ts: t.ts, text: t.text.slice(0, 280), link: t.link }));
}
