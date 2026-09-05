import { BANKED_NOTICE_MAX_AGE, BANKED_SOURCE_URL, publicBankedNotices, type BankedNotice } from '../../src/lib/banked-notices';
import { isResetRetraction } from './scrape';
import type { ScrapeResult } from './types';

/** Announcements are context, never reset records or notification candidates. */
export function buildBankedNotices(scrape: ScrapeResult, now: number): BankedNotice[] {
  if (!scrape.ok || scrape.sourceKind !== 'direct') return [];
  const notices: BankedNotice[] = [];
  for (const tweet of scrape.tweets) {
    if (!BANKED_SOURCE_URL.test(tweet.link) || !Number.isFinite(tweet.ts)
      || tweet.ts > now || now - tweet.ts > BANKED_NOTICE_MAX_AGE) continue;
    const text = tweet.text.replace(/[’‘]/g, "'");
    if (!/\bbanked\s+resets?\b/i.test(text)) continue;
    const correction = isResetRetraction(text);
    const sentences = text.split(/(?<=[.!?])\s+|\n+/);
    const assertions = sentences.filter((sentence) => !/\?|\b(?:not|never|won't|would|could|might|maybe|if|hasn't|haven't|didn't|don't)\b/i.test(sentence)
      && !/\b(?:test|testing|sandbox|staging)\b/i.test(sentence));
    // The condition about access in "one ... for every day you don't have
    // access" describes eligibility, not a denial of the grant itself.
    const promised = sentences.some((sentence) => /\bwe(?:'ll| will)\s+(?:give|do|grant|add|credit)\b[^.!?\n]{0,60}\bbanked\s+reset/i.test(sentence)
      && !/\?|\b(?:if we|test|testing|sandbox|staging)\b/i.test(sentence))
      || sentences.some((sentence) => /\bwe've got you covered\b[^.!?\n]{0,60}\bbanked\s+reset/i.test(sentence) && !/\?|\b(?:test|testing|sandbox|staging)\b/i.test(sentence))
      || assertions.some((sentence) => /\bbanked\s+resets?\b[^.!?\n]{0,40}\bwill (?:land|arrive)\b/i.test(sentence));
    const available = assertions.some((sentence) => !/\b(?:will|tomorrow|going to|expected|scheduled)\b/i.test(sentence)
      && (/\bbanked\s+resets?\s+(?:(?:has|have|been|is|are|just|now)\s+)*(?:landed|arrived|available)\b/i.test(sentence)
        || /\b(?:added|credited|given)\b[^.!?\n]{0,60}\bbanked\s+resets?\b/i.test(sentence)));
    if (!correction && !promised && !available) continue;
    const plans = ['Plus', 'Pro', 'Business', 'Enterprise'].filter((plan) => new RegExp('\\b' + plan + '\\b', 'i').test(text));
    if (!plans.length && /\bpaid\b/i.test(text)) plans.push('paid');
    notices.push({ sourceUrl: tweet.link, publishedAt: tweet.ts,
      state: correction ? 'correction' : available ? 'available' : 'announced', plans });
  }
  return publicBankedNotices(notices, now);
}
