import { runPipelineOnce } from './pipeline';
import type { DeliveryLedger, Env, RunReport } from './types';

interface PipelineRequest {
  trigger?: unknown;
}

const ALLOWED_TRIGGERS = new Set(['cron', 'manual', 'x-webhook']);
const DELIVERY_LEDGER_PREFIX = 'delivery:sent:';
const DELIVERY_LEDGER_SALT_KEY = 'delivery:salt';
const DELIVERY_LEDGER_RETENTION_MS = 31 * 24 * 60 * 60 * 1000;

/**
 * A single globally named coordinator makes the pipeline a single-writer
 * workflow without a database migration or a fragile distributed lease.
 */
export class PipelineCoordinator {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/run') return response({ error: 'not found' }, 404);

    let body: PipelineRequest;
    try {
      body = await request.json() as PipelineRequest;
    } catch {
      return response({ error: 'invalid json' }, 400);
    }
    if (typeof body.trigger !== 'string' || !ALLOWED_TRIGGERS.has(body.trigger)) {
      return response({ error: 'invalid trigger' }, 400);
    }

    const report = await this.state.blockConcurrencyWhile(async () => {
      const deliveryLedger = new PipelineDeliveryLedger(this.state.storage);
      const result = await runPipelineOnce(this.env, body.trigger as string, deliveryLedger);
      // The ledger contains only keyed digests, never email addresses or Push
      // endpoints. Pruning keeps the retry guard bounded to the delivery
      // retention period used by the rest of the Worker metrics.
      await deliveryLedger.prune();
      return result;
    });
    return response(report);
  }
}

/**
 * Durable Object-backed per-recipient delivery state. The coordinator is a
 * single writer, so a recipient cannot be selected by two overlapping runs.
 * Only an HMAC of the recipient is retained; the underlying address/endpoint
 * is never written to Durable Object storage.
 */
class PipelineDeliveryLedger implements DeliveryLedger {
  private saltPromise: Promise<string> | undefined;

  constructor(private readonly storage: DurableObjectStorage) {}

  async hasDelivered(resetId: string, channel: 'email' | 'push', recipient: string): Promise<boolean> {
    const deliveredAt = await this.storage.get<number>(await this.key(resetId, channel, recipient));
    return typeof deliveredAt === 'number' && Date.now() - deliveredAt <= DELIVERY_LEDGER_RETENTION_MS;
  }

  async markDelivered(resetId: string, channel: 'email' | 'push', recipient: string): Promise<void> {
    await this.storage.put(await this.key(resetId, channel, recipient), Date.now());
  }

  async prune(): Promise<void> {
    const entries = await this.storage.list<number>({ prefix: DELIVERY_LEDGER_PREFIX });
    const expiry = Date.now() - DELIVERY_LEDGER_RETENTION_MS;
    const expired = [...entries].flatMap(([key, deliveredAt]) => (
      typeof deliveredAt === 'number' && deliveredAt < expiry ? [key] : []
    ));
    if (expired.length > 0) await this.storage.delete(expired);
  }

  private async key(resetId: string, channel: 'email' | 'push', recipient: string): Promise<string> {
    const salt = await this.getSalt();
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(salt),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${resetId}:${channel}:${recipient}`));
    return `${DELIVERY_LEDGER_PREFIX}${resetId}:${channel}:${hex(signature)}`;
  }

  private getSalt(): Promise<string> {
    if (!this.saltPromise) {
      this.saltPromise = (async () => {
        const existing = await this.storage.get<string>(DELIVERY_LEDGER_SALT_KEY);
        if (existing) return existing;
        const generated = crypto.randomUUID();
        await this.storage.put(DELIVERY_LEDGER_SALT_KEY, generated);
        return generated;
      })();
    }
    return this.saltPromise;
  }
}

function hex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function response(body: RunReport | { error: string }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
