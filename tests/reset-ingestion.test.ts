import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyResetNotification, detectResetEvents, isScheduledResetAnnouncement, parseScheduledResetAt, scrapeTweets } from '../worker/src/scrape';
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
    SITE_URL: 'https://codexresets.cc',
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
      'We have reset Codex limits for all paid users.',
    ];
    const negatives = [
      'Will you reset Codex usage limits?', 'We will reset usage limits tomorrow.',
      'We have not reset Codex usage limits.', 'Codex usage limits have not been reset.',
      'If we have reset usage limits, you can continue.',
      'The Codex reset has not landed.', 'Codex usage limits reset every week.',
      'We have added a new Codex model. A reset would be nice.',
      'Reset will land around 14pm PST tomorrow.',
      '@someone Ah yeah, forgot to say',
      'We have reset usage limits for one affected Codex account.',
      'We have reset usage limits for all Codex users on our test environment.',
      'We have reset usage limits for selected Codex users.',
      'We have reset usage limits only for Pro users.',
    ];
    for (const text of positives) expect(detectResetEvents([{ text, ts: NOW, link: 'official' }]).strong, text).toHaveLength(1);
    for (const text of negatives) expect(detectResetEvents([{ text, ts: NOW, link: 'official' }]).strong, text).toHaveLength(0);
    expect(classifyResetNotification('We have reset usage limits for all Codex users. You can still spend banked resets and credits later.')).toBe('direct');
  });

  it('recognizes ordinary schedules and explicit days/zones without guessing ambiguous times', () => {
    const postedAt = Date.parse('2026-08-30T05:00:00Z'); // Aug 29 in Pacific time
    for (const text of ['We will reset Codex usage limits tomorrow at 2pm PDT.', 'Codex usage limits will be reset tomorrow at 2pm PT.', 'Reset will land around 14pm PST tomorrow.']) {
      expect(isScheduledResetAnnouncement(text), text).toBe(true);
      expect(detectResetEvents([{ text, ts: postedAt, link: 'official' }]).strong).toHaveLength(0);
    }
    expect(parseScheduledResetAt('We will reset Codex usage limits tomorrow at 2pm PDT.', postedAt)).toBe(Date.parse('2026-08-30T21:00:00Z'));
    expect(parseScheduledResetAt('We will reset Codex usage limits tomorrow at 2 p.m. PDT.', postedAt)).toBe(Date.parse('2026-08-30T21:00:00Z'));
    expect(parseScheduledResetAt('Codex usage limits will be reset tomorrow at 2pm PT.', postedAt)).toBe(Date.parse('2026-08-30T21:00:00Z'));
    expect(parseScheduledResetAt('Reset will land around 2pm PDT today.', postedAt)).toBe(Date.parse('2026-08-29T21:00:00Z'));
    expect(parseScheduledResetAt('Reset will land on Monday at 14:00 UTC.', postedAt)).toBe(Date.parse('2026-08-31T14:00:00Z'));
    expect(parseScheduledResetAt('Reset will land on 2026-09-01 at 14:00 UTC.', postedAt)).toBe(Date.parse('2026-09-01T14:00:00Z'));
    for (const text of ['Reset will land around 2pm PDT.', 'Reset will land tomorrow at 2pm.', 'Reset will land on 2026-02-31 at 14:00 UTC.', 'Reset will land on 2026-11-01 at 1:30am PT.']) {
      expect(parseScheduledResetAt(text, postedAt), text).toBeUndefined();
    }
    for (const text of ['We will reset usage limits for one Codex account tomorrow at 2pm PDT.', 'We will not reset Codex usage limits tomorrow at 2pm PDT.']) {
      expect(isScheduledResetAnnouncement(text)).toBe(false);
    }
  });

  it('shows a newer future plan instead of an earlier completed reset', async () => {
    const { env } = setup();
    const result = await buildSignalsSnapshot(env, { ok: true, sourceKind: 'direct', tweets: [
      { text: 'We will reset Codex usage limits tomorrow at 2pm PDT.', ts: NOW - HOUR, link: 'next-reset' },
      { text: 'We have reset usage limits for all paid Codex users.', ts: NOW - 3 * HOUR, link: 'completed' },
    ] }, NOW - 3 * HOUR, 2, [], { state: 'clear', incidentCount: 0 });
    expect(result.signals[0]).toMatchObject({ description: 'signals.resetScheduled', sourceUrl: 'next-reset' });
  });

  it('recovers legacy quoted context as history-only without replaying an alert', async () => {
    const text = 'This celebration is moved to tomorrow as the button was already pressed today.';
    const { env, cache } = setup({ [timelineKey]: JSON.stringify({
      checkedAt: NOW - HOUR, sinceId: '200', tweets: [{ text, ts: NOW - HOUR, link: 'https://x.com/thsottiaux/status/200' }],
    }) });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/2/users/42/tweets') return Response.json({ meta: { result_count: 0 } });
      if (url.pathname === '/2/tweets') return Response.json({
        data: [{ ...post('200', text), referenced_tweets: [{ type: 'quoted', id: '150' }] }],
        includes: { tweets: [post('150', 'We have reset usage limits for all paid Codex users.', NOW - 2 * HOUR)] },
      });
      throw new Error('unexpected endpoint');
    }));
    const result = await scrapeTweets(env);
    expect(result.contextPending).toBe(0);
    expect(detectResetEvents(result.tweets).strong).toEqual([expect.objectContaining({ historyOnly: true })]);
    expect(JSON.parse(cache[timelineKey]).contextVersion).toBe(1);
  });

  it('retries missing parent context independently of the incremental watermark', async () => {
    const { env, cache } = setup({ [timelineKey]: JSON.stringify({ checkedAt: NOW - HOUR, sinceId: '100', tweets: [], contextVersion: 1 }) });
    let lookups = 0;
    const reply = { ...post('200', '@reader Ah yeah, forgot to say'), referenced_tweets: [{ type: 'replied_to', id: '150' }] };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/2/tweets') {
        lookups++;
        return lookups === 1 ? Response.json({ data: [reply], errors: [{ resource_id: '150' }] }) : Response.json({
          data: [reply], includes: { tweets: [{ ...post('150', 'All paid Codex users got their usage reset again.', NOW - 2 * HOUR), author_id: 'other' }] },
        });
      }
      return url.searchParams.get('since_id') === '100' ? Response.json({ data: [reply], errors: [{ resource_id: '150' }] }) : Response.json({ meta: {} });
    }));
    const first = await scrapeTweets(env);
    expect(first).toMatchObject({ ok: true, contextPending: 1 });
    expect(JSON.parse(cache[timelineKey]).sinceId).toBe('200');
    const second = await scrapeTweets(env);
    expect(second).toMatchObject({ ok: true, contextPending: 0 });
    expect(detectResetEvents(second.tweets).strong).toHaveLength(1);
    expect(cache[timelineKey]).not.toContain('All paid Codex users got');
  });

  it('stops after three missing-context lookups without blocking new posts', async () => {
    const { env } = setup({ [timelineKey]: JSON.stringify({ checkedAt: NOW - HOUR, sinceId: '100', tweets: [], contextVersion: 1,
      pendingReplies: [{ id: '100', attempts: 0, historyOnly: true }] }) });
    let lookups = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (new URL(String(input)).pathname === '/2/tweets') { lookups++; return new Response(null, { status: 503 }); }
      return Response.json({ meta: {} });
    }));
    await scrapeTweets(env);
    await scrapeTweets(env);
    expect(await scrapeTweets(env)).toMatchObject({ ok: true, contextPending: 0, contextUnavailable: 1 });
    expect(await scrapeTweets(env)).toMatchObject({ ok: true, contextPending: 0 });
    expect(lookups).toBe(3);
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
    expect(snapshot.signals[0]).toMatchObject({
      status: 'idle',
      value: 0.08,
      description: 'signals.resetConfirmed',
    });
    expect(snapshot.signals[2].descriptionParams.d).toBe('0.3');
    const again = await runPipelineOnce(env, 'test');
    expect(again).toMatchObject({ notifiedEmails: 0, errors: [] });
    expect(rows).toHaveLength(1);
  });

  it.each(['observed', 'confirmed'] as const)('delivers a timely %s reset through the full pipeline only once', async (state) => {
    const { env } = setup({ [timelineKey]: JSON.stringify({ checkedAt: NOW - HOUR, sinceId: '100', tweets: [], contextVersion: 1 }) });
    env.RESEND_API_KEY = 'test-only';
    env.UNSUBSCRIBE_SECRET = 'test-only';
    env.RESEND_FROM = 'alerts@example.test';
    const recent: ResetRecordRow = {
      id: 'recent', reset_date: new Date(NOW - HOUR).toISOString(),
      verified: state === 'confirmed', automated: true, auto_state: state,
      auto_confirm_after: new Date(NOW - HOUR / 2).toISOString(),
      created_at: new Date(NOW - HOUR).toISOString(), notified_at: null,
      source_url: 'https://x.com/thsottiaux/status/100', description: 'We have reset usage limits for all paid Codex users.',
    };
    const rows: ResetRecordRow[] = [
      recent,
      { ...recent, id: 'history', verified: true, automated: false, auto_state: 'manual' },
      { ...recent, id: 'expired', verified: true, auto_state: 'confirmed', reset_date: new Date(NOW - 49 * HOUR).toISOString() },
      { ...recent, id: 'sent', verified: true, auto_state: 'confirmed', notified_at: new Date(NOW - HOUR).toISOString() },
    ];
    let sends = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === 'api.x.com') return Response.json({ meta: { result_count: 0 } });
      if (url.pathname.includes('codex-changelog')) return new Response('Codex updates');
      if (url.hostname === 'status.openai.com') return Response.json({ incidents: [] });
      if (url.pathname.endsWith('/reset_records')) {
        if (init?.method === 'PATCH') {
          const row = rows.find((item) => `eq.${item.id}` === url.searchParams.get('id'));
          expect(row).toBeDefined();
          Object.assign(row!, JSON.parse(String(init.body)));
          return new Response(null, { status: 204 });
        }
        return Response.json(rows);
      }
      if (url.pathname.endsWith('/subscriptions')) {
        expect(url.searchParams.get('select')).toBe('email,locale');
        expect(url.searchParams.get('is_active')).toBe('eq.true');
        expect(url.searchParams.get('order')).toBe('email.asc');
        expect(url.searchParams.get('limit')).toBe('500');
        return Response.json(url.searchParams.has('email') ? [] : [{ email: 'reader@example.test' }]);
      }
      if (url.pathname.endsWith('/push_subscriptions')) return Response.json([]);
      if (url.hostname === 'api.resend.com') {
        const body = JSON.parse(String(init?.body));
        expect(body.html).toContain(recent.source_url);
        sends++;
        return Response.json({ id: 'mock-delivery' });
      }
      throw new Error(`Unexpected request: ${url.origin}${url.pathname}`);
    }));
    const report = await runPipelineOnce(env, 'test');
    expect(report.errors).toEqual([]);
    expect(report.notifiedEmails).toBe(1);
    expect(recent).toMatchObject({ verified: true, auto_state: 'confirmed', notified_at: new Date(NOW).toISOString() });
    expect(rows[1].notified_at).toBeNull();
    expect(rows[2].notified_at).toBeNull();
    expect(await runPipelineOnce(env, 'test')).toMatchObject({ notifiedEmails: 0, errors: [] });
    expect(sends).toBe(1);
  });

  it.each(['provider-503', 'accepted-timeout', 'database-mark', 'ledger-mark'] as const)(
    'recovers %s through the full pipeline without sending twice', async (failure) => {
      const { env } = setup({ [timelineKey]: JSON.stringify({ checkedAt: NOW - HOUR, sinceId: '100', tweets: [], contextVersion: 1 }) });
      env.RESEND_API_KEY = 'test-only';
      env.UNSUBSCRIBE_SECRET = 'test-only';
      env.RESEND_FROM = 'alerts@example.test';
      const row: ResetRecordRow = {
        id: 'retry-reset', reset_date: new Date(NOW - HOUR).toISOString(),
        verified: true, automated: true, auto_state: 'confirmed', notified_at: null,
        source_url: 'https://x.com/thsottiaux/status/100', description: 'We have reset usage limits for all paid Codex users.',
      };
      const delivered = new Set<string>();
      let ledgerFailure = failure === 'ledger-mark';
      let failedLedgerRecipient: string | null = null;
      const ledger = {
        hasDelivered: async (id: string, channel: string, recipient: string) => delivered.has(`${id}:${channel}:${recipient}`),
        markDelivered: async (id: string, channel: string, recipient: string) => {
          if (ledgerFailure) { ledgerFailure = false; failedLedgerRecipient = recipient; throw new Error('ledger unavailable'); }
          delivered.add(`${id}:${channel}:${recipient}`);
        },
      };
      const accepted = new Map<string, string>();
      const attempts: string[] = [];
      let providerFailure = true;
      let markFailure = failure === 'database-mark';
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.hostname === 'api.x.com') return Response.json({ meta: { result_count: 0 } });
        if (url.pathname.includes('codex-changelog')) return new Response('Codex updates');
        if (url.hostname === 'status.openai.com') return Response.json({ incidents: [] });
        if (url.pathname.endsWith('/reset_records')) {
          if (init?.method === 'PATCH') {
            if (markFailure) { markFailure = false; return new Response('temporarily unavailable', { status: 503 }); }
            Object.assign(row, JSON.parse(String(init.body)));
            return new Response(null, { status: 204 });
          }
          return Response.json([row]);
        }
        if (url.pathname.endsWith('/subscriptions')) {
          expect(url.searchParams.get('select')).toBe('email,locale');
          expect(url.searchParams.get('is_active')).toBe('eq.true');
          expect(url.searchParams.get('order')).toBe('email.asc');
          expect(url.searchParams.get('limit')).toBe('500');
          return Response.json(url.searchParams.has('email') ? [] : [{ email: 'first@example.test' }, { email: 'second@example.test' }]);
        }
        if (url.pathname.endsWith('/push_subscriptions')) return Response.json([]);
        if (url.hostname === 'api.resend.com') {
          const body = String(init?.body);
          const recipient = JSON.parse(body).to[0];
          const key = new Headers(init?.headers).get('idempotency-key')!;
          expect(key).toBeTruthy();
          expect(init?.signal).toBeDefined();
          attempts.push(recipient);
          if (recipient === 'second@example.test' && providerFailure && failure === 'provider-503') {
            providerFailure = false;
            return new Response('unavailable', { status: 503 });
          }
          // Model the provider's documented idempotency contract, not actual delivery.
          if (accepted.has(key)) expect(body).toBe(accepted.get(key));
          else accepted.set(key, body);
          if (recipient === 'second@example.test' && providerFailure && failure === 'accepted-timeout') {
            providerFailure = false;
            throw new DOMException('response lost after acceptance', 'TimeoutError');
          }
          return Response.json({ id: 'mock-provider-id' });
        }
        throw new Error(`Unexpected request: ${url.origin}${url.pathname}`);
      }));
      expect((await runPipelineOnce(env, 'test', ledger)).errors.length).toBeGreaterThan(0);
      if (failure === 'ledger-mark') {
        expect(delivered.size).toBe(1);
        expect(delivered.has(`retry-reset:email:${failedLedgerRecipient}`)).toBe(false);
      }
      expect(row.notified_at).toBeNull();
      vi.setSystemTime(NOW + HOUR / 2);
      expect((await runPipelineOnce(env, 'test', ledger)).errors).toEqual([]);
      expect(row.notified_at).toBe(new Date(NOW + HOUR / 2).toISOString());
      expect(accepted.size).toBe(2);
      // Signing and sending fan out concurrently. Assert each run's exact
      // recipients, not the nondeterministic order of the first two requests.
      expect(attempts.slice(0, 2).sort()).toEqual(['first@example.test', 'second@example.test']);
      expect(attempts.slice(2).sort()).toEqual(failure === 'database-mark'
        ? []
        : failure === 'ledger-mark'
          ? [failedLedgerRecipient]
          : ['second@example.test']);
      const requestCount = attempts.length;
      expect(await runPipelineOnce(env, 'test', ledger)).toMatchObject({ notifiedEmails: 0, errors: [] });
      expect(attempts).toHaveLength(requestCount);
    },
  );

  it('excludes past scores affected by recovered history without rewriting them as hits', async () => {
    const sample = { at: NOW - 5 * 24 * HOUR, dueAt: NOW - 3 * 24 * HOUR, model: 'weibull', prob24h: 0.9, prob48h: 0.9, resetIn24h: false, resetIn48h: false };
    const { cache, store } = setup({ 'forecast:evaluations': JSON.stringify([sample]) });
    await recordForecastSnapshotInStore(store, [{
      id: 'recovered', reset_date: new Date(NOW - 4 * 24 * HOUR).toISOString(),
      verified: true, automated: false, auto_state: 'manual', created_at: new Date(NOW).toISOString(), source_url: null, description: null,
    }], NOW);
    expect(JSON.parse(cache['forecast:evaluations'])[0]).toEqual({ ...sample, historyIncomplete: true });
    expect((await getForecastCalibrationFromStore(store)).samples).toBe(0);
    expect(JSON.parse(cache['forecast:pending'])).toHaveLength(0);
  });

  it('does not let a confirmed reset or older schedule become a future signal behind a newer question', async () => {
    const { env } = setup();
    const result = await buildSignalsSnapshot(env, { ok: true, sourceKind: 'direct', tweets: [
      { text: 'When will Codex usage limits reset again?', ts: NOW - HOUR, link: 'question' },
      { text: 'We are reseting usage for all paid users of Codex.', ts: NOW - 2 * HOUR, link: 'confirmed' },
      { text: 'Reset will land around 14pm PST tomorrow.', ts: NOW - 24 * HOUR, link: 'scheduled' },
    ] }, NOW - 2 * HOUR, 2, [], { state: 'clear', incidentCount: 0 });
    expect(result.signals[0]).toMatchObject({
      status: 'idle',
      value: 0.08,
      description: 'signals.activeToday',
      sourceUrl: 'https://x.com/thsottiaux',
    });
  });
});
