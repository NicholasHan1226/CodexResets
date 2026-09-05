import { createECDH } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyAll, notifyForecastPrealert, notifyScheduledExecution } from '../worker/src/notify';
import { privListEmails, privListPush } from '../worker/src/privileged';
import type { DeliveryLedger, Env, PreparedEmail } from '../worker/src/types';

const env = { SUPABASE_SERVICE_ROLE_KEY: 'fixture', SUPABASE_URL: 'https://db.invalid', RESEND_API_KEY: 'fixture', RESEND_FROM: 'Alerts <alerts@example.com>', SITE_URL: 'https://example.com', UNSUBSCRIBE_SECRET: 'fixture' } as Env;
const forecast = { id: 'forecast/cycle', evaluatedAt: Date.now(), planningProbability: 0.7, modelProbability: 0.4, officialEvidenceUrl: null };
function store() { return { prepared: new Map<string, PreparedEmail>(), attempts: new Map<string, number>(), delivered: new Set<string>() }; }
function ledger(state: ReturnType<typeof store>): DeliveryLedger {
  const key = (id: string, channel: string, recipient: string) => `${id}/${channel}/${recipient}`;
  return {
    hasDelivered: async (...args) => state.delivered.has(key(...args)),
    markDelivered: async (...args) => { state.delivered.add(key(...args)); },
    getPreparedEmail: async (id, recipient) => structuredClone(state.prepared.get(key(id, 'email', recipient))),
    prepareEmail: async (id, recipient, message) => { state.prepared.set(key(id, 'email', recipient), structuredClone(message)); },
    lastAttemptAt: async (...args) => state.attempts.get(key(...args)) ?? 0,
    markAttempt: async (...args) => { state.attempts.set(key(...args), Date.now()); },
  };
}
function mockRecipients(rows: { email: string; locale?: string }[], send: (init: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.resend.com') return send(init);
    if (url.pathname.endsWith('/push_subscriptions')) return Response.json([]);
    if (url.pathname.endsWith('/subscriptions')) return Response.json(url.searchParams.has('email') ? [] : rows);
    throw new Error('unexpected fixture request');
  }));
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('notification replay and recipient progress', () => {
  it.each(['forecast', 'scheduled', 'confirmed'] as const)('freezes %s body across a lost response, restart, locale and content change', async (kind) => {
    const state = store();
    const rows = [{ email: 'person+tag@example.com', locale: 'en' }];
    let body: string | undefined;
    let key: string | undefined;
    let calls = 0;
    mockRecipients(rows, async (init) => {
      calls++;
      if (!body) { body = String(init.body); key = new Headers(init.headers).get('idempotency-key')!; throw new Error('response lost after acceptance'); }
      expect(String(init.body)).toBe(body);
      expect(new Headers(init.headers).get('idempotency-key')).toBe(key);
      return Response.json({ id: 'accepted' });
    });
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const run = (changed: boolean) => kind === 'forecast'
      ? notifyForecastPrealert({ ...env, RESEND_FROM: changed ? 'Changed <new@example.com>' : env.RESEND_FROM }, { ...forecast, evaluatedAt: Date.now(), planningProbability: changed ? 0.9 : 0.7 }, ledger(state))
      : kind === 'scheduled'
        ? notifyScheduledExecution(env, { id: 'due', scheduledAt: now, officialEvidenceUrl: null, communityCorroborated: changed }, ledger(state))
        : notifyAll(env, { id: 'reset', ts: now, text: changed ? 'Banked credits reset' : 'Codex limits reset', link: '' }, ledger(state));
    expect((await run(false)).errors).toHaveLength(1);
    const snapshot = JSON.stringify([...state.prepared.values()]);
    expect(snapshot).not.toContain(rows[0].email);
    expect(snapshot).not.toContain(encodeURIComponent(rows[0].email));
    rows[0].locale = 'zh';
    clock.mockReturnValue(now + 30 * 60_000);
    expect(await run(true)).toMatchObject({ emails: 1, errors: [] });
    expect(calls).toBe(2);
    expect(body).toContain(encodeURIComponent(rows[0].email));
  });

  it('refuses ambiguous replay after the safe provider dedupe window', async () => {
    const state = store();
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const send = vi.fn(async () => { throw new Error('lost response'); });
    mockRecipients([{ email: 'person@example.com' }], send);
    await notifyForecastPrealert(env, forecast, ledger(state));
    clock.mockReturnValue(now + 24 * 60 * 60_000);
    expect((await notifyForecastPrealert(env, forecast, ledger(state))).errors[0]).toContain('needs-review');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('records successful delivery while a peer request is still pending', async () => {
    const state = store();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    mockRecipients([{ email: 'fast@example.com' }, { email: 'slow@example.com' }], async (init) => {
      if (JSON.parse(String(init.body)).to[0] === 'slow@example.com') await blocked;
      return Response.json({ id: 'accepted' });
    });
    const run = notifyForecastPrealert(env, forecast, ledger(state));
    await vi.waitFor(() => expect(state.delivered.size).toBe(1));
    expect([...state.delivered][0]).toContain('fast@example.com');
    release();
    expect(await run).toMatchObject({ emails: 2, errors: [] });
  });

  it('retries a stale push endpoint when deletion fails without claiming a prune', async () => {
    const state = store();
    const vapid = createECDH('prime256v1'); vapid.generateKeys();
    const subscriber = createECDH('prime256v1'); subscriber.generateKeys();
    const endpoint = 'https://fcm.googleapis.com/fcm/send/fixture';
    const row = { endpoint, p256dh: subscriber.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') };
    const pushEnv = { ...env, VAPID_PUBLIC_KEY: vapid.getPublicKey().toString('base64url'), VAPID_PRIVATE_KEY: vapid.getPrivateKey().toString('base64url'), VAPID_SUBJECT: 'mailto:alerts@example.com' };
    let deletes = 0;
    let pushes = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      if (String(input) === endpoint) { pushes++; return new Response(null, { status: 410 }); }
      if (init.method === 'DELETE') return ++deletes === 1 ? new Response(null, { status: 503 }) : new Response(null, { status: 204 });
      if (url.pathname.endsWith('/subscriptions')) return Response.json([]);
      return Response.json(url.searchParams.has('endpoint') ? [] : [row]);
    }));
    const event = { id: 'push-reset', ts: Date.now(), text: 'Codex limits reset', link: '' };
    const first = await notifyAll(pushEnv, event, ledger(state));
    expect(first).toMatchObject({ pushes: 0, prunedPushEndpoints: 0, errors: [expect.stringContaining('deletion failed: 503')] });
    expect(state.delivered.size).toBe(0);
    expect(await notifyAll(pushEnv, event, ledger(state))).toMatchObject({ pushes: 0, prunedPushEndpoints: 1, errors: [] });
    expect(state.delivered.size).toBe(1);
    expect(pushes).toBe(2);
    expect(deletes).toBe(2);
  });

  it('lets recipient 51 progress after the first 50 fail', async () => {
    const state = store();
    const rows = Array.from({ length: 51 }, (_, i) => ({ email: `${String(i).padStart(2, '0')}@example.com` }));
    const attempts: string[] = [];
    mockRecipients(rows, async (init) => {
      const recipient = JSON.parse(String(init.body)).to[0]; attempts.push(recipient);
      return recipient === rows[50].email ? Response.json({ id: 'ok' }) : new Response('failed', { status: 500 });
    });
    expect(await notifyForecastPrealert(env, forecast, ledger(state))).toMatchObject({ emails: 0, pending: true });
    expect(await notifyForecastPrealert(env, forecast, ledger(state))).toMatchObject({ emails: 1 });
    expect(attempts.slice(50, 60)).toContain(rows[50].email);
  });
});

describe('private recipient keyset pagination', () => {
  it.each(['email', 'endpoint'] as const)('continues across smaller API caps with escaped %s cursors', async (key) => {
    const values = ['a', 'b"comma,slash\\plus+&@example.com', 'c', 'd', 'e'];
    const rows = values.map((value) => key === 'email' ? { email: value } : { endpoint: value, auth: 'a', p256dh: 'p' });
    const filters: string[] = [];
    let page = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = new URL(input);
      expect(url.searchParams.get('limit')).toBe('500');
      expect(url.searchParams.get('order')).toBe(`${key}.asc`);
      filters.push(url.searchParams.get(key) ?? '');
      const chunk = rows.slice(page * 2, ++page * 2);
      return Response.json(chunk);
    }));
    expect(await (key === 'email' ? privListEmails(env) : privListPush(env))).toEqual(rows);
    expect(filters[1]).toBe('gt."b\\"comma,slash\\\\plus+&@example.com"');
    expect(filters).toHaveLength(4);
  });

  it('rejects repeated pages and redacts failed private cursor requests', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([{ email: 'private@example.com' }])));
    await expect(privListEmails(env)).rejects.toThrow('no progress');
    let count = 0;
    vi.stubGlobal('fetch', vi.fn(async () => ++count === 1 ? Response.json([{ email: 'private@example.com' }]) : new Response('private@example.com', { status: 500 })));
    await expect(privListEmails(env)).rejects.toThrow('private subscription pagination failed');
  });
});
