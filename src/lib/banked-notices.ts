/** Public official context, deliberately separate from forecast inputs and delivery. */
export interface BankedNotice {
  sourceUrl: string;
  publishedAt: number;
  state: 'announced' | 'available' | 'correction';
  plans: string[];
}

export const BANKED_NOTICE_MAX_AGE = 7 * 24 * 3600_000;
export const BANKED_SOURCE_URL = /^https:\/\/x\.com\/thsottiaux\/status\/\d+$/;

/** Whitelist the public contract at both the Worker and browser boundary. */
export function publicBankedNotices(value: unknown, now = Date.now()): BankedNotice[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is BankedNotice => {
    if (!item || typeof item.sourceUrl !== 'string' || !BANKED_SOURCE_URL.test(item.sourceUrl)
      || seen.has(item.sourceUrl) || !Number.isFinite(item.publishedAt)
      || item.publishedAt > now || now - item.publishedAt > BANKED_NOTICE_MAX_AGE
      || !['announced', 'available', 'correction'].includes(item.state)
      || !Array.isArray(item.plans) || item.plans.length > 6
      || item.plans.some((plan: unknown) => typeof plan !== 'string'
        || !['Plus', 'Pro', 'Business', 'Team', 'Enterprise', 'paid'].includes(plan))) return false;
    seen.add(item.sourceUrl);
    return true;
  }).sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 3)
    .map(({ sourceUrl, publishedAt, state, plans }) => ({ sourceUrl, publishedAt, state, plans }));
}
