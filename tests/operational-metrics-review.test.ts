import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSubscriptionQuality, getXWebhookQuality } from '../worker/src/operational-metrics';
import type { Env } from '../worker/src/types';

const NOW = Date.parse('2026-09-05T12:00:00.000Z');
function fixture(pageSize = 100) {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  const data = new Map<string, string | null>();
  const get = vi.fn(async (key: string) => data.get(key) ?? null);
  const list = vi.fn(async ({ prefix, cursor, limit = 100 }: { prefix: string; cursor?: string; limit?: number }) => {
    const names = [...data.keys()].filter((key) => key.startsWith(prefix)).sort();
    const offset = Number(cursor || 0);
    const end = offset + Math.min(pageSize, limit);
    return { keys: names.slice(offset, end).map((name) => ({ name })), list_complete: end >= names.length, cursor: String(end) };
  });
  const add = (at: string, kind = 'email_confirmed', extra = {}) => {
    const stream = kind === 'x_webhook' ? 'x-webhook' : 'subscription';
    const key = `metrics:${stream}:${at.slice(0, 10)}:${String(data.size).padStart(5, '0')}`;
    data.set(key, JSON.stringify({ at, kind, count: 1, ...extra }));
    return key;
  };
  return { data, get, list, add, env: { CACHE: { get, list } } as unknown as Env };
}

afterEach(() => vi.restoreAllMocks());

describe('bounded operational metrics coverage', () => {
  it('reads recent days first when older traffic exceeds 500 and labels partial totals', async () => {
    const f = fixture(37);
    for (let index = 0; index < 600; index += 1) f.add('2026-09-04T12:00:00.000Z', 'email_confirmation_sent');
    f.add('2026-09-05T11:00:00.000Z', 'email_delivered');
    const result = await getSubscriptionQuality(f.env);
    expect(result.email).toMatchObject({ delivered: 1, lastDeliveredAt: '2026-09-05T11:00:00.000Z', confirmationSent: 499 });
    expect(result.coverage).toMatchObject({ complete: false, truncated: true, available: true, scannedKeys: 500, limit: 500, selection: 'recent-days-first' });
    expect(f.list.mock.calls[0][0].prefix).toBe('metrics:subscription:2026-09-05:');
    expect(f.get).toHaveBeenCalledTimes(500);
  });

  it('paginates short pages and identifies a full window without claiming cohort conversion', async () => {
    const f = fixture(2);
    f.add('2026-09-05T01:00:00.000Z', 'email_confirmation_sent');
    for (let index = 0; index < 4; index += 1) f.add('2026-09-05T02:00:00.000Z');
    f.add('2026-09-03T01:00:00.000Z', 'push_registered');
    const result = await getSubscriptionQuality(f.env);
    expect(result).toMatchObject({ sampledEvents: 6, rateBasis: 'sampled-event-counts-not-cohorts', email: { confirmationRate: 4 }, push: { registered: 1 }, coverage: { complete: true, truncated: false } });
    expect(f.list.mock.calls.filter(([options]) => options.prefix.includes('2026-09-05')).map(([options]) => options.cursor)).toEqual([undefined, '2', '4']);
  });

  it('includes both rolling-window boundaries but excludes older and future event times', async () => {
    const f = fixture();
    f.add('2026-08-05T11:59:59.999Z');
    f.add('2026-08-05T12:00:00.000Z');
    f.add('2026-09-05T12:00:00.000Z');
    f.add('2026-09-05T12:00:00.001Z');
    f.add('2026-08-04T12:00:00.000Z');
    const result = await getSubscriptionQuality(f.env);
    expect(result.sampledEvents).toBe(2);
    expect(result.coverage).toMatchObject({ complete: true, windowStart: '2026-08-05T12:00:00.000Z', windowEnd: '2026-09-05T12:00:00.000Z', scannedKeys: 4 });
    expect(f.list).toHaveBeenCalledTimes(32);
  });

  it('distinguishes a complete empty window from unavailable list support', async () => {
    const f = fixture();
    expect(await getSubscriptionQuality(f.env)).toMatchObject({ sampledEvents: 0, coverage: { complete: true, available: true, truncated: false } });
    expect(await getSubscriptionQuality({ CACHE: {} } as unknown as Env)).toMatchObject({ sampledEvents: 0, coverage: { complete: false, available: false } });
  });

  it('reports malformed, invalid count and disappeared entries instead of contaminating totals', async () => {
    const f = fixture();
    f.data.set(f.add('2026-09-05T01:00:00.000Z'), '{broken');
    f.add('2026-09-05T01:00:00.000Z', 'email_confirmed', { count: -3 });
    f.add('2026-09-05T01:00:00.000Z', 'email_confirmed', { count: '4' });
    f.add('2026-09-05T01:00:00.000Z', 'unknown');
    f.data.set(f.add('2026-09-05T01:00:00.000Z'), null);
    f.add('2026-09-05T01:00:00.000Z');
    const result = await getSubscriptionQuality(f.env);
    expect(result).toMatchObject({ sampledEvents: 1, email: { confirmed: 1 }, coverage: { complete: false, invalidEntries: 4, missingEntries: 1 } });
  });

  it('stops cyclic or non-progressing cursors, including empty nonfinal pages', async () => {
    const f = fixture();
    f.list.mockResolvedValue({ keys: [], list_complete: false, cursor: 'same' });
    expect(await getSubscriptionQuality(f.env)).toMatchObject({ coverage: { complete: false, readErrors: 1 } });
    expect(f.list).toHaveBeenCalledTimes(2);
  });

  it('bounds pathological empty pagination even with advancing cursors', async () => {
    const f = fixture();
    let cursor = 0;
    f.list.mockImplementation(async () => ({ keys: [], list_complete: false, cursor: String(++cursor) }));
    expect(await getSubscriptionQuality(f.env)).toMatchObject({ coverage: { complete: false, truncated: true } });
    expect(f.list).toHaveBeenCalledTimes(64);
  });

  it('returns explicit partial telemetry on list or value read failure', async () => {
    const f = fixture();
    f.list.mockRejectedValueOnce(new Error('private provider response'));
    expect(await getSubscriptionQuality(f.env)).toMatchObject({ coverage: { complete: false, readErrors: 1 } });
    f.add('2026-09-05T01:00:00.000Z');
    f.get.mockRejectedValueOnce(new Error('private provider response'));
    const result = await getSubscriptionQuality(f.env);
    expect(result).toMatchObject({ sampledEvents: 0, coverage: { complete: false, readErrors: 1 } });
    expect(JSON.stringify(result)).not.toContain('private provider response');
  });

  it('applies the same coverage and validation to X outcomes', async () => {
    const f = fixture(1);
    f.add('2026-09-05T01:00:00.000Z', 'x_webhook', { outcome: 'completed' });
    f.add('2026-09-05T02:00:00.000Z', 'x_webhook', { outcome: 'failed' });
    f.add('2026-09-05T03:00:00.000Z', 'x_webhook', { outcome: 'unknown' });
    expect(await getXWebhookQuality(f.env)).toMatchObject({ sampledEvents: 2, completed: 1, failed: 1, lastReceivedAt: '2026-09-05T02:00:00.000Z', lastCompletedAt: '2026-09-05T01:00:00.000Z', coverage: { complete: false, invalidEntries: 1 } });
  });
});
