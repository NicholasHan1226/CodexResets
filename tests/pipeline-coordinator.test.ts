import { afterEach, describe, expect, it, vi } from 'vitest';
import { PipelineDeliveryLedger } from '../worker/src/pipeline-coordinator';
import type { PreparedEmail } from '../worker/src/types';

function storageFixture() {
  const values = new Map<string, unknown>();
  const deletedSizes: number[] = [];
  const storage = {
    get: async (key: string) => structuredClone(values.get(key)),
    put: async (key: string, value: unknown) => { values.set(key, structuredClone(value)); },
    list: async ({ prefix, startAfter, limit }: { prefix: string; startAfter?: string; limit: number }) => new Map(
      [...values].filter(([key]) => key.startsWith(prefix) && (!startAfter || key > startAfter)).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit),
    ),
    delete: async (keys: string[]) => { deletedSizes.push(keys.length); for (const key of keys) values.delete(key); },
  };
  return { values, deletedSizes, storage: storage as unknown as DurableObjectStorage };
}

afterEach(() => vi.useRealTimers());

describe('durable recipient progress', () => {
  it('keeps the current cycle protected after 31 days, including ambiguous prepared sends', async () => {
    const now = Date.parse('2026-09-05T00:00:00Z');
    vi.useFakeTimers(); vi.setSystemTime(now);
    const fixture = storageFixture();
    const ledger = new PipelineDeliveryLedger(fixture.storage);
    const id = `forecast-prealert-24h:${now}`;
    await ledger.markDelivered(id, 'email', 'sent@example.test');
    await ledger.prepareEmail(id, 'unknown@example.test', { preparedAt: now, from: 'alerts@example.test', subject: 'original', headers: {}, html: '', text: '' });
    vi.setSystemTime(now + 32 * 86_400_000);
    await ledger.prune(id);
    expect(await ledger.hasDelivered(id, 'email', 'sent@example.test')).toBe(true);
    expect((await ledger.getPreparedEmail(id, 'unknown@example.test'))?.preparedAt).toBe(now);
    await ledger.prune('forecast-prealert-24h:new-cycle');
    expect(await ledger.getPreparedEmail(id, 'unknown@example.test')).toBeUndefined();
  });

  it('retains immutable prepared mail, delivery and scheduling across ledger recreation without recipient PII', async () => {
    const now = Date.parse('2026-09-05T00:00:00Z');
    vi.useFakeTimers(); vi.setSystemTime(now);
    const fixture = storageFixture();
    const first = new PipelineDeliveryLedger(fixture.storage);
    const recipient = 'reader@example.test';
    const message: PreparedEmail = { preparedAt: now, from: 'alerts@example.test', subject: 'first', headers: {}, html: '<p>frozen</p>', text: 'frozen' };
    await first.prepareEmail('campaign', recipient, message);
    await first.markAttempt('campaign', 'email', recipient);
    await first.markDelivered('campaign', 'email', recipient);
    const restarted = new PipelineDeliveryLedger(fixture.storage);
    await restarted.prepareEmail('campaign', recipient, { ...message, subject: 'changed' });
    expect(await restarted.getPreparedEmail('campaign', recipient)).toEqual(message);
    expect(await restarted.lastAttemptAt('campaign', 'email', recipient)).toBe(now);
    expect(await restarted.hasDelivered('campaign', 'email', recipient)).toBe(true);
    expect(await restarted.hasDelivered('other', 'email', recipient)).toBe(false);
    const persisted = JSON.stringify([...fixture.values]);
    expect(persisted).not.toContain(recipient);
    expect(persisted).not.toContain(encodeURIComponent(recipient));
  });

  it('prunes all retained record types in bounded pages without losing live progress', async () => {
    const now = Date.parse('2026-09-05T00:00:00Z');
    vi.useFakeTimers(); vi.setSystemTime(now);
    const fixture = storageFixture();
    const old = now - 32 * 86_400_000;
    for (const prefix of ['sent', 'attempt', 'prepared']) {
      for (let i = 0; i < 260; i++) fixture.values.set(`delivery:${prefix}:${i.toString().padStart(3, '0')}`, prefix === 'prepared' ? { preparedAt: old } : old);
      fixture.values.set(`delivery:${prefix}:live`, prefix === 'prepared' ? { preparedAt: now } : now);
    }
    await new PipelineDeliveryLedger(fixture.storage).prune();
    expect(fixture.values.size).toBe(3);
    expect([...fixture.values.keys()].every((key) => key.endsWith(':live'))).toBe(true);
    expect(Math.max(...fixture.deletedSizes)).toBeLessThanOrEqual(128);
  });
});
