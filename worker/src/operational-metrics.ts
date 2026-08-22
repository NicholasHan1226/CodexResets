import type { Env, RunReport } from './types';

const METRIC_TTL_SECONDS = 31 * 24 * 60 * 60;
const MAX_METRIC_KEYS = 500;

export type SubscriptionMetricKind =
  | 'email_confirmation_sent'
  | 'email_confirmed'
  | 'email_bounced'
  | 'email_complained'
  | 'email_unsubscribed'
  | 'push_registered'
  | 'push_test_delivered'
  | 'push_test_skipped'
  | 'push_expired_during_test'
  | 'push_unsubscribed'
  | 'push_pruned_after_delivery';

interface MetricEntry {
  at: string;
  kind: string;
  count?: number;
  outcome?: 'completed' | 'failed' | 'ignored' | 'duplicate';
  pipeline?: {
    scrape: RunReport['scrape'];
    directSource?: RunReport['directSource'];
    candidates: number;
    pendingInserted: number;
    autoConfirmed: number;
    errors: number;
  };
}

export interface SubscriptionQuality {
  sampledEvents: number;
  email: {
    confirmationSent: number;
    confirmed: number;
    confirmationRate: number | null;
    bounced: number;
    complained: number;
    unsubscribed: number;
  };
  push: {
    registered: number;
    testDelivered: number;
    testSkipped: number;
    expiredDuringTest: number;
    unsubscribed: number;
    prunedAfterDelivery: number;
  };
}

export interface XWebhookQuality {
  sampledEvents: number;
  completed: number;
  failed: number;
  ignored: number;
  duplicates: number;
  lastReceivedAt: string | null;
  lastCompletedAt: string | null;
}

/**
 * A metric is one append-only, non-PII KV record rather than a shared daily
 * counter. KV has a per-key write limit, while webhook and signup traffic can
 * be concurrent; operational telemetry must never make a user request fail.
 */
export async function recordSubscriptionMetric(env: Env, kind: SubscriptionMetricKind, count = 1): Promise<void> {
  await recordMetric(env, 'subscription', { kind, count });
}

export async function recordXWebhookOutcome(
  env: Env,
  outcome: NonNullable<MetricEntry['outcome']>,
  report?: RunReport,
): Promise<void> {
  await recordMetric(env, 'x-webhook', {
    kind: 'x_webhook',
    outcome,
    pipeline: report ? {
      scrape: report.scrape,
      directSource: report.directSource,
      candidates: report.candidates,
      pendingInserted: report.pendingInserted || 0,
      autoConfirmed: report.autoConfirmed || 0,
      errors: report.errors.length,
    } : undefined,
  });
}

/** Private, bounded admin diagnostic. Missing KV list support is treated as no telemetry. */
export async function getSubscriptionQuality(env: Env): Promise<SubscriptionQuality> {
  const entries = await readMetricEntries(env, 'subscription');
  const quality: SubscriptionQuality = {
    sampledEvents: entries.length,
    email: { confirmationSent: 0, confirmed: 0, confirmationRate: null, bounced: 0, complained: 0, unsubscribed: 0 },
    push: { registered: 0, testDelivered: 0, testSkipped: 0, expiredDuringTest: 0, unsubscribed: 0, prunedAfterDelivery: 0 },
  };
  for (const entry of entries) {
    const count = entry.count || 0;
    switch (entry.kind as SubscriptionMetricKind) {
      case 'email_confirmation_sent': quality.email.confirmationSent += count; break;
      case 'email_confirmed': quality.email.confirmed += count; break;
      case 'email_bounced': quality.email.bounced += count; break;
      case 'email_complained': quality.email.complained += count; break;
      case 'email_unsubscribed': quality.email.unsubscribed += count; break;
      case 'push_registered': quality.push.registered += count; break;
      case 'push_test_delivered': quality.push.testDelivered += count; break;
      case 'push_test_skipped': quality.push.testSkipped += count; break;
      case 'push_expired_during_test': quality.push.expiredDuringTest += count; break;
      case 'push_unsubscribed': quality.push.unsubscribed += count; break;
      case 'push_pruned_after_delivery': quality.push.prunedAfterDelivery += count; break;
    }
  }
  if (quality.email.confirmationSent > 0) {
    quality.email.confirmationRate = quality.email.confirmed / quality.email.confirmationSent;
  }
  return quality;
}

/** Private X webhook receipt-to-pipeline readback, without event payloads or account identifiers. */
export async function getXWebhookQuality(env: Env): Promise<XWebhookQuality> {
  const entries = await readMetricEntries(env, 'x-webhook');
  const quality: XWebhookQuality = {
    sampledEvents: entries.length,
    completed: 0,
    failed: 0,
    ignored: 0,
    duplicates: 0,
    lastReceivedAt: null,
    lastCompletedAt: null,
  };
  for (const entry of entries) {
    if (!entry.at) continue;
    if (!quality.lastReceivedAt || entry.at > quality.lastReceivedAt) quality.lastReceivedAt = entry.at;
    if (entry.outcome === 'completed') {
      quality.completed += 1;
      if (!quality.lastCompletedAt || entry.at > quality.lastCompletedAt) quality.lastCompletedAt = entry.at;
    } else if (entry.outcome === 'failed') {
      quality.failed += 1;
    } else if (entry.outcome === 'ignored') {
      quality.ignored += 1;
    } else if (entry.outcome === 'duplicate') {
      quality.duplicates += 1;
    }
  }
  return quality;
}

async function recordMetric(env: Env, stream: 'subscription' | 'x-webhook', entry: Omit<MetricEntry, 'at'>): Promise<void> {
  const at = new Date().toISOString();
  const key = `metrics:${stream}:${at.slice(0, 10)}:${crypto.randomUUID()}`;
  await env.CACHE.put(key, JSON.stringify({ at, ...entry } satisfies MetricEntry), { expirationTtl: METRIC_TTL_SECONDS });
}

interface ListableCache {
  list?: (options: { prefix: string; cursor?: string; limit?: number }) => Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

async function readMetricEntries(env: Env, stream: 'subscription' | 'x-webhook'): Promise<MetricEntry[]> {
  const cache = env.CACHE as unknown as ListableCache;
  if (typeof cache.list !== 'function') return [];
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await cache.list({ prefix: `metrics:${stream}:`, cursor, limit: 100 });
    keys.push(...page.keys.map((key) => key.name));
    cursor = page.list_complete || keys.length >= MAX_METRIC_KEYS ? undefined : page.cursor;
  } while (cursor);

  const raw = await Promise.all(keys.slice(0, MAX_METRIC_KEYS).map((key) => env.CACHE.get(key)));
  return raw.flatMap((value) => parseEntry(value));
}

function parseEntry(raw: string | null): MetricEntry[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as Partial<MetricEntry>;
    return typeof value.at === 'string' && typeof value.kind === 'string' ? [value as MetricEntry] : [];
  } catch {
    return [];
  }
}
