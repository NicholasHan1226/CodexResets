import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyResetNotification, detectResetEvents, scrapeTweets } from '../worker/src/scrape';
import { isAutomaticallyDeliverable, runPipelineOnce } from '../worker/src/pipeline';
import { getForecastCalibrationFromStore, recordForecastSnapshotInStore } from '../worker/src/forecast';
import { buildSignalsSnapshot } from '../worker/src/signals';
import type { Env, ResetRecordRow } from '../worker/src/types';

const NOW = Date.parse('2026-08-30T04:00:00Z');
const HOUR = 3600_000;
const timelineKey = 'x-api:timeline:v2:thsottiaux';
function setup(cache: Record<string, string> = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const store = {
    get: async (key: string) => cache[key] ?? null,
    put: async (key: string, value: string) => { cache[key] = value; },
    delete: async (key: string) => { delete cache[key]; },
  };
  const env = {
    CACHE: store, TARGET_ACCOUNT: 'thsottiaux', X_BEARER_TOKEN: 'test-only',
    RSSHUB_INSTANCES: '', SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-only',
  } as unknown as Env;
  cache['x-api:user:thsottiaux'] = '42';
  return { cache, store, env };
}
function post(id: string, text: string, ts = NOW - HOUR) {
  return { id, author_id: '42', text, created_at: new Date(ts).toISOString() };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('reset ingestion regressions', () => {
  it('recognizes real announcement forms without turning questions, plans or denials into events', () => {
    const positives = [
      'We are reseting usage for all paid users of Codex and ChatGPT Work.',
      'Never slept better and feeling reseted. Brand new me and brand new usage for all ChatGPT Work and Codex users.',
      'Good Sunday. Reset has been propagated to accounts and we landed some fixes to usage for things mentioned yesterday as issues we found.',
      'I have reset usage limits for all paid users of ChatGPT Work and Codex.',
      'The usage limits have been reset for Codex users. What is next? More fixes tomorrow.',
      'We have added a banked reset to all Codex accounts.',
    ];
    const negatives = [
      'Will you reset Codex usage limits?', 'We will reset usage limits tomorrow.',
      'We have not reset Codex usage limits.', 'Codex usage limits have not been reset.',
      'If we have reset usage limits, you can continue.',
      'The Codex reset has not landed.', 'Codex usage limits reset every week.',
      'We have added a new Codex model. A reset would be nice.',
      'Reset will land around 14pm PST tomorrow.',
      '@someone Ah yeah, forgot to say',
    ];
    for (const text of positives) expect(detectResetEvents([{ text, ts: NOW, link: 'official' }]).strong, text).toHaveLength(1);
    for (const text of negatives) expect(detectResetEvents([{ text, ts: NOW, link: 'official' }]).strong, text).toHaveLength(0);
    expect(classifyResetNotification('We have reset usage limits for all Codex users. You can still spend banked resets and credits later.')).toBe('direct');
  });

  it('paginates, reads full text and reply context, then fetches only new posts without replaying bootstrap alerts', async () => {
    const { env, cache } = setup();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.has('since_id')) {
        expect(url.searchParams.get('since_id')).toBe('300');
        return Response.json({ data: [post('400', 'Codex usage limits are reset.', NOW)], meta: {} });
      }
      if (url.searchParams.has('pagination_token')) return Response.json({ data: [post('100', 'Reset has been propagated to Codex accounts.', NOW - 4 * 24 * HOUR)], meta: {} });
      expect(url.searchParams.get('tweet.fields')).toContain('note_tweet');
      expect(url.searchParams.get('expansions')).toBe('referenced_tweets.id');
      return Response.json({
        data: [
          { ...post('300', 'A long update…'), note_tweet: { text: 'We are reseting usage for all paid Codex users.' } },
          { ...post('200', '@reader Ah yeah, forgot to say'), referenced_tweets: [{ type: 'replied_to', id: '150' }] },
        ],
        includes: { tweets: [{ ...post('150', 'All paid Codex users got their usage reset again.', NOW - 2 * HOUR), author_id: 'other' }] },
        meta: { next_token: 'page2' },
      });
    });
    vi.stubGlobal('fetch', fetcher);
    const first = await scrapeTweets(env);
    expect(first.tweets).toHaveLength(3);
    expect(detectResetEvents(first.tweets).strong).toHaveLength(3);
    expect(first.tweets.every((tweet) => tweet.historyOnly)).toBe(true);
    expect(cache[timelineKey]).not.toContain('All paid Codex users got');
    expect(cache[timelineKey]).not.toContain('other');
    const second = await scrapeTweets(env);
    expect(second.tweets).toHaveLength(4);
    expect(second.tweets[0]).toMatchObject({ historyOnly: false });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('does not advance the watermark or use cached posts as live when a later page fails', async () => {
    const old = JSON.stringify({ checkedAt: NOW - HOUR, sinceId: '100', tweets: [] });
    const { env, cache } = setup({ [timelineKey]: old });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname === 'api.x.com' && !url.searchParams.has('pagination_token')) return Response.json({ data: [post('200', 'Codex usage limits are reset.')], meta: { next_token: 'second' } });
      return new Response(null, { status: 503 });
    }));
    const result = await scrapeTweets(env);
    expect(result.ok).toBe(false);
    expect(cache[timelineKey]).toBe(old);
  });

  it('keeps a successful empty incremental read live and retains the recent official evidence', async () => {
    const tweet = { text: 'Codex usage limits are reset.', ts: NOW - HOUR, link: 'https://x.com/thsottiaux/status/100', historyOnly: true };
    const { env } = setup({ [timelineKey]: JSON.stringify({ checkedAt: NOW - HOUR, sinceId: '100', tweets: [tweet] }) });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ meta: { result_count: 0 } })));
    const result = await scrapeTweets(env);
    expect(result).toMatchObject({ ok: true, sourceKind: 'direct', tweets: [tweet] });
  });

  it('fails visibly at the page bound instead of silently dropping the unseen backlog', async () => {
    const { env, cache } = setup();
    let pages = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith('https://api.x.com/')) {
        pages++;
        return Response.json({ data: [post(String(1000 - pages), 'Codex usage limits are reset.')], meta: { next_token: `next-${pages}` } });
      }
      return new Response(null, { status: 503 });
    }));
    const result = await scrapeTweets(env);
    expect(pages).toBe(8);
    expect(result.ok).toBe(false);
    expect(result.attempted?.[0]).toContain('pagination bound reached');
    expect(cache[timelineKey]).toBeUndefined();
  });

  it('does not acknowledge malformed official posts or unverified reply context', async () => {
    const { env, cache } = setup();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).startsWith('https://api.x.com/')
      ? Response.json({ data: [{ id: '10', text: 'Codex usage limits are reset.' }] })
      : new Response(null, { status: 503 })));
    expect((await scrapeTweets(env)).ok).toBe(false);
    expect(cache[timelineKey]).toBeUndefined();
    expect(detectResetEvents([{ text: 'The button was already pressed today.', ts: NOW, link: 'reply' }]).strong).toHaveLength(0);
    expect(detectResetEvents([{ text: 'The button was already pressed today.', ts: NOW, link: 'reply', officialParentText: 'Codex usage will be reset.' }]).strong).toHaveLength(1);
  });

  it('repairs bootstrap history without subscriber fanout and emits a matching fresh snapshot', async () => {
    const { env, cache } = setup();
    const rows: ResetRecordRow[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://api.x.com/')) return Response.json({ data: [post('200', 'We are reseting usage for all paid users of Codex.', NOW - 6 * HOUR)], meta: {} });
      if (url.includes('codex-changelog')) return new Response('Codex updates');
      if (url.includes('status.openai.com')) return Response.json({ incidents: [] });
      if (url.includes('/reset_records?select=')) return Response.json(rows);
      if (url.endsWith('/reset_records') && init?.method === 'POST') {
        const incoming = JSON.parse(String(init.body)) as ResetRecordRow[];
        rows.push(...incoming.map((row, i) => ({ ...row, id: `record-${i}`, created_at: new Date(NOW).toISOString() })));
        return Response.json(rows);
      }
      throw new Error(`Unexpected request (including any subscriber read): ${url}`);
    }));
    const report = await runPipelineOnce(env, 'test');
    expect(report).toMatchObject({ recoveredHistory: 1, pendingInserted: 0, notifiedEmails: 0, notifiedPush: 0, errors: [] });
    expect(rows[0]).toMatchObject({ verified: true, automated: false, auto_state: 'manual' });
    expect(isAutomaticallyDeliverable(rows[0], NOW)).toBe(false);
    const snapshot = JSON.parse(cache['signals:latest']);
    expect(snapshot.history[0].reset_date).toBe(new Date(NOW - 6 * HOUR).toISOString());
    expect(snapshot.signals[0].description).toBe('signals.resetAnnounced');
    expect(snapshot.signals[2].descriptionParams.d).toBe('0.3');
    const again = await runPipelineOnce(env, 'test');
    expect(again).toMatchObject({ notifiedEmails: 0, errors: [] });
    expect(rows).toHaveLength(1);
  });

  it('excludes past scores affected by recovered history without rewriting them as hits', async () => {
    const sample = { at: NOW - 5 * 24 * HOUR, dueAt: NOW - 3 * 24 * HOUR, model: 'weibull', prob24h: 0.9, prob48h: 0.9, resetIn24h: false, resetIn48h: false };
    const { cache, store } = setup({ 'forecast:evaluations': JSON.stringify([sample]) });
    await recordForecastSnapshotInStore(store, [{
      id: 'recovered', reset_date: new Date(NOW - 4 * 24 * HOUR).toISOString(),
      verified: true, automated: false, auto_state: 'manual', created_at: new Date(NOW).toISOString(), source_url: null, description: null,
    }], NOW);
    expect(JSON.parse(cache['forecast:evaluations'])[0]).toEqual({ ...sample, historyIncomplete: true });
    expect((await getForecastCalibrationFromStore(store)).samples).toBe(0);
    expect(JSON.parse(cache['forecast:pending'])).toHaveLength(1);
  });

  it('does not let a newer question hide a real reset or keep an older schedule active', async () => {
    const { env } = setup();
    const result = await buildSignalsSnapshot(env, { ok: true, sourceKind: 'direct', tweets: [
      { text: 'When will Codex usage limits reset again?', ts: NOW - HOUR, link: 'question' },
      { text: 'We are reseting usage for all paid users of Codex.', ts: NOW - 2 * HOUR, link: 'confirmed' },
      { text: 'Reset will land around 14pm PST tomorrow.', ts: NOW - 24 * HOUR, link: 'scheduled' },
    ] }, NOW - 2 * HOUR, 2, [], { state: 'clear', incidentCount: 0 });
    expect(result.signals[0]).toMatchObject({ description: 'signals.resetAnnounced', sourceUrl: 'confirmed' });
  });
});
