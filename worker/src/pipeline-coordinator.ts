import { runPipelineOnce } from './pipeline';
import type { DeliveryLedger, Env, PreparedEmail, RunReport } from './types';

interface PipelineRequest {
  trigger?: unknown;
}

const ALLOWED_TRIGGERS = new Set(['cron', 'manual', 'x-webhook']);
const DELIVERY_LEDGER_PREFIX = 'delivery:sent:';
const DELIVERY_ATTEMPT_PREFIX = 'delivery:attempt:';
const DELIVERY_PREPARED_PREFIX = 'delivery:prepared:';
const DELIVERY_LEDGER_SALT_KEY = 'delivery:salt';
const DELIVERY_LEDGER_RETENTION_MS = 31 * 24 * 60 * 60 * 1000;

/**
 * A single globally named coordinator makes the pipeline a single-writer
 * workflow without a database migration or a fragile distributed lease.
 */
export class PipelineCoordinator {
  // Each request awaits its predecessor without holding the platform's
  // 30-second blockConcurrencyWhile gate across external I/O. On eviction,
  // recipient progress remains durable and the next cron resumes delivery.
  private tail: Promise<void> = Promise.resolve();

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

    const run = this.tail.then(async () => {
      const startedAt = new Date().toISOString();
      const deliveryLedger = new PipelineDeliveryLedger(this.state.storage);
      try {
        const result = await runPipelineOnce(this.env, body.trigger as string, deliveryLedger);
        const latestReset = Number(await this.env.CACHE.get('latest_reset_ts'));
        await deliveryLedger.prune(latestReset > 0 ? `forecast-prealert-24h:${latestReset}` : undefined);
        return result;
      } catch {
        // An interrupted run must not leave an old green report as its only
        // health evidence. Provider exceptions may contain recipient details.
        const failed: RunReport = {
          startedAt, trigger: body.trigger as string, scrape: 'failed',
          tweetsSeen: 0, candidates: 0, inserted: 0, notifiedEmails: 0,
          notifiedPush: 0, errors: ['pipeline interrupted; incomplete delivery will retry'],
        };
        await this.env.CACHE.put('health:last_run', JSON.stringify(failed));
        return failed;
      }
    });
    // A failed health write must not poison subsequent queued requests.
    this.tail = run.then(() => undefined, () => undefined);
    return response(await run);
  }
}

/**
 * Durable Object-backed per-recipient delivery state. The coordinator is a
 * single writer, so a recipient cannot be selected by two overlapping runs.
 * Only an HMAC of the recipient is retained; the underlying address/endpoint
 * is never written to Durable Object storage.
 */
export class PipelineDeliveryLedger implements DeliveryLedger {
  private saltPromise: Promise<string> | undefined;

  constructor(private readonly storage: DurableObjectStorage) {}

  async hasDelivered(resetId: string, channel: 'email' | 'push', recipient: string): Promise<boolean> {
    const deliveredAt = await this.storage.get<number>(await this.key(resetId, channel, recipient));
    // Expiry is applied by pruning retired cycles. A long-running current
    // cycle must retain its once-only guard even beyond the usual retention.
    return typeof deliveredAt === 'number';
  }

  async markDelivered(resetId: string, channel: 'email' | 'push', recipient: string): Promise<void> {
    await this.storage.put(await this.key(resetId, channel, recipient), Date.now());
  }

  async getPreparedEmail(resetId: string, recipient: string): Promise<PreparedEmail | undefined> {
    return this.storage.get<PreparedEmail>(await this.key(resetId, 'email', recipient, DELIVERY_PREPARED_PREFIX));
  }

  async prepareEmail(resetId: string, recipient: string, message: PreparedEmail): Promise<void> {
    const key = await this.key(resetId, 'email', recipient, DELIVERY_PREPARED_PREFIX);
    if (!await this.storage.get(key)) await this.storage.put(key, message);
  }

  async lastAttemptAt(resetId: string, channel: 'email' | 'push', recipient: string): Promise<number> {
    return await this.storage.get<number>(await this.key(resetId, channel, recipient, DELIVERY_ATTEMPT_PREFIX)) ?? 0;
  }

  async markAttempt(resetId: string, channel: 'email' | 'push', recipient: string): Promise<void> {
    await this.storage.put(await this.key(resetId, channel, recipient, DELIVERY_ATTEMPT_PREFIX), Date.now());
  }

  async prune(activeForecastId?: string): Promise<void> {
    const expiry = Date.now() - DELIVERY_LEDGER_RETENTION_MS;
    for (const prefix of [DELIVERY_LEDGER_PREFIX, DELIVERY_ATTEMPT_PREFIX, DELIVERY_PREPARED_PREFIX]) {
      let startAfter: string | undefined;
      for (;;) {
        const entries = await this.storage.list<number | PreparedEmail>({ prefix, startAfter, limit: 128 });
        if (entries.size === 0) break;
        const expired = [...entries].flatMap(([key, value]) => {
          if (activeForecastId && key.startsWith(`${prefix}${activeForecastId}:`)) return [];
          const at = typeof value === 'number' ? value : value.preparedAt;
          return at < expiry ? [key] : [];
        });
        if (expired.length > 0) await this.storage.delete(expired);
        startAfter = [...entries.keys()].at(-1);
      }
    }
  }

  private async key(resetId: string, channel: 'email' | 'push', recipient: string, prefix = DELIVERY_LEDGER_PREFIX): Promise<string> {
    const salt = await this.getSalt();
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(salt),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${resetId}:${channel}:${recipient}`));
    return `${prefix}${resetId}:${channel}:${hex(signature)}`;
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
