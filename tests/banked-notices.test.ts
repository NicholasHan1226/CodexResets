import { describe, expect, it, vi, afterEach } from 'vitest';
import { buildBankedNotices } from '../worker/src/banked';
import { buildSignalsSnapshot } from '../worker/src/signals';
import { detectResetEvents } from '../worker/src/scrape';
import { handleSignals } from '../worker/src/routes';
import { publicBankedNotices } from '../src/lib/banked-notices';
import type { Env, ScrapeResult } from '../worker/src/types';

const now = Date.parse('2026-09-05T11:00:00Z');
const tweets = [
  { ts: 1788477129000, link: 'https://x.com/thsottiaux/status/2095651088502591861', text: "We will give one banked reset for every day you don't have access to Astra on your paid ChatGPT plan, starting today.  Team is moving mountains to give access as fast as we can.\n\nFirst one will land in ~ 3 hours. There is still time to create your account if you don't have one." },
  { ts: 1788555437000, link: 'https://x.com/thsottiaux/status/2095979536043401428', text: "Some Plus and Business users won't yet get access to Astra today, we've got you covered with a banked reset. Lands by end of day and if you create your account by 8pm PT then you'll get it too." },
  { ts: 1788568765000, link: 'https://x.com/thsottiaux/status/2096035437299237298', text: "Because we are beyond happy to have Astra rolled out today ahead of schedule and you have been super patient with us (not really, but it’s ok!)… we will do the full banked reset today too for all Plus, Pro and Business users. Lands end of day.\n\nHappy Astra day and enjoy a phenomenal weekend.\n\nPS: If you create the account or upgrade before 8pm PT you will get it too. Still time!" },
];
const scrape: ScrapeResult = { ok: true, sourceKind: 'direct', tweets };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('banked reset grant announcements', () => {
  it('recovers all three real announcements, keeping eligibility updates separate from grant counts', () => {
    const notices = buildBankedNotices(scrape, now);
    expect(notices.map((n) => n.sourceUrl)).toEqual([...tweets].reverse().map((t) => t.link));
    expect(notices.map((n) => n.state)).toEqual(['announced', 'announced', 'announced']);
    expect(notices.map((n) => n.plans)).toEqual([['Plus', 'Pro', 'Business'], ['Plus', 'Business'], ['paid']]);
    expect(detectResetEvents(tweets).strong).toEqual([]);
    expect(buildBankedNotices({ ...scrape, tweets: [...tweets, tweets[2]] }, now)).toHaveLength(3);
  });

  it('does not promote elapsed promises or eligibility cutoffs to confirmed arrival', () => {
    expect(buildBankedNotices(scrape, now + 86400_000).every((n) => n.state === 'announced')).toBe(true);
    for (const text of ['When will we give a banked reset?', 'We will not give a banked reset.', 'If we will give a banked reset, we will say so.', 'We will give a banked reset in staging.', 'Redeem your banked reset from the account menu.', 'Your banked reset expires today.']) {
      expect(buildBankedNotices({ ...scrape, tweets: [{ ...tweets[0], text }] }, now), text).toEqual([]);
    }
    expect(buildBankedNotices({ ...scrape, tweets: [{ ...tweets[0], text: 'The banked reset has landed for Plus users.' }] }, now)[0].state).toBe('available');
    expect(buildBankedNotices({ ...scrape, tweets: [{ ...tweets[0], text: 'The banked reset has been postponed.' }] }, now)[0].state).toBe('correction');
  });

  it('rejects degraded, stale, future and other-account evidence', () => {
    expect(buildBankedNotices({ ...scrape, sourceKind: 'degraded' }, now)).toEqual([]);
    expect(buildBankedNotices({ ...scrape, ok: false }, now)).toEqual([]);
    expect(buildBankedNotices(scrape, now + 8 * 86400_000)).toEqual([]);
    expect(buildBankedNotices(scrape, tweets[0].ts - 1)).toEqual([]);
    expect(buildBankedNotices({ ...scrape, tweets: [{ ...tweets[0], link: 'https://x.com/other/status/1' }] }, now)).toEqual([]);
    expect(publicBankedNotices([{ ...buildBankedNotices(scrape, now)[0], sourceUrl: 'javascript:alert(1)' }], now)).toEqual([]);
  });

  it('survives snapshot, public API and browser parsing despite newer unrelated posts, without affecting the model', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const history = [{ id: 'verified', reset_date: '2026-08-31T02:29:25Z', verified: true as const }];
    const input = { ...scrape, tweets: [{ text: 'Enjoy your weekend!', ts: now - 1000, link: 'https://x.com/thsottiaux/status/999' }, ...tweets] };
    const snapshot = await buildSignalsSnapshot({} as Env, input, Date.parse(history[0].reset_date), 2.2, history, { state: 'clear', incidentCount: 0 });
    expect(snapshot.bankedNotices).toHaveLength(3);
    expect(snapshot.history).toEqual(history);
    expect(snapshot.signals[0].status).toBe('idle');
    expect(snapshot.signals[0].scheduledAt).toBeUndefined();
    const response = await handleSignals({ CACHE: { get: async () => JSON.stringify(snapshot) } } as unknown as Env);
    const payload = await response.json();
    expect(payload).toMatchObject({ bankedNotices: snapshot.bankedNotices });
    vi.resetModules();
    vi.stubEnv('VITE_PIPELINE_API_URL', 'https://pipeline.test');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(payload)));
    const { getDashboardInputs } = await import('../src/lib/signal-fetcher');
    const browser = await getDashboardInputs(true);
    expect(browser.bankedNotices).toEqual(snapshot.bankedNotices);
    expect(browser.records).toHaveLength(1);
  });
});
