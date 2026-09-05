import type { Env, RunReport } from './types';

const METRIC_TTL_SECONDS = 31 * 24 * 60 * 60;
const MAX_METRIC_KEYS = 500;
const MAX_LIST_PAGES = 64;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface MetricCoverage {
  windowStart: string;
  windowEnd: string;
  complete: boolean;
  truncated: boolean;
  available: boolean;
  scannedKeys: number;
  invalidEntries: number;
  missingEntries: number;
  readErrors: number;
  /** UTC days are newest first; UUID keys within a day are not chronological. */
  selection: 'recent-days-first';
  limit: number;
}

export type SubscriptionMetricKind =
  | 'email_confirmation_sent'
  | 'email_confirmed'
  | 'email_delivered'
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
  coverage: MetricCoverage;
  rateBasis: 'sampled-event-counts-not-cohorts';
  sampledEvents: number;
  email: {
    confirmationSent: number;
    confirmed: number;
    confirmationRate: number | null;
    delivered: number;
    lastDeliveredAt: string | null;
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
  coverage: MetricCoverage;
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

/** Stable per provider email, even when a receipt is retried with a new webhook ID. */
export async function recordEmailDelivered(env: Env, emailId: string, at: string, count: number): Promise<void> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(emailId));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  // No recipient, subject, provider ID or raw callback is persisted.
  await env.CACHE.put(`metrics:subscription:${at.slice(0, 10)}:delivered-${fingerprint}`,
    JSON.stringify({ at, kind: 'email_delivered', count } satisfies MetricEntry),
    { expirationTtl: METRIC_TTL_SECONDS });
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

/** Private, bounded admin diagnostic. Coverage distinguishes zero activity from missing telemetry. */
export async function getSubscriptionQuality(env: Env): Promise<SubscriptionQuality> {
  const { entries, coverage } = await readMetricEntries(env, 'subscription');
  const quality: SubscriptionQuality = {
    coverage,
    rateBasis: 'sampled-event-counts-not-cohorts',
    sampledEvents: entries.length,
    email: { confirmationSent: 0, confirmed: 0, confirmationRate: null, delivered: 0, lastDeliveredAt: null, bounced: 0, complained: 0, unsubscribed: 0 },
    push: { registered: 0, testDelivered: 0, testSkipped: 0, expiredDuringTest: 0, unsubscribed: 0, prunedAfterDelivery: 0 },
  };
  for (const entry of entries) {
    const count = entry.count || 0;
    switch (entry.kind as SubscriptionMetricKind) {
      case 'email_confirmation_sent': quality.email.confirmationSent += count; break;
      case 'email_confirmed': quality.email.confirmed += count; break;
      case 'email_delivered':
        quality.email.delivered += count;
        if (!quality.email.lastDeliveredAt || entry.at > quality.email.lastDeliveredAt) quality.email.lastDeliveredAt = entry.at;
        break;
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
  const { entries, coverage } = await readMetricEntries(env, 'x-webhook');
  const quality: XWebhookQuality = {
    coverage,
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

async function readMetricEntries(env: Env, stream: 'subscription' | 'x-webhook'): Promise<{
  entries: MetricEntry[];
  coverage: MetricCoverage;
}> {
  const end = Date.now();
  const start = end - METRIC_TTL_SECONDS * 1000;
  const coverage: MetricCoverage = {
    windowStart: new Date(start).toISOString(), windowEnd: new Date(end).toISOString(),
    complete: true, truncated: false, available: true, scannedKeys: 0,
    invalidEntries: 0, missingEntries: 0, readErrors: 0,
    selection: 'recent-days-first', limit: MAX_METRIC_KEYS,
  };
  const cache = env.CACHE as unknown as ListableCache;
  if (typeof cache.list !== 'function') {
    coverage.available = false;
    coverage.complete = false;
    return { entries: [], coverage };
  }
  const keys = new Set<string>();
  let pages = 0;
  // A rolling 31-day window spans up to 32 UTC date prefixes. Starting with
  // today's prefix prevents a busy older day from consuming the entire cap.
  days: for (let day = Math.floor(end / DAY_MS); day >= Math.floor(start / DAY_MS); day -= 1) {
    const prefix = `metrics:${stream}:${new Date(day * DAY_MS).toISOString().slice(0, 10)}:`;
    let cursor: string | undefined;
    const cursors = new Set<string>();
    do {
      if (keys.size >= MAX_METRIC_KEYS || pages >= MAX_LIST_PAGES) {
        coverage.truncated = true;
        break days;
      }
      let page: Awaited<ReturnType<NonNullable<ListableCache['list']>>>;
      try {
        page = await cache.list({ prefix, cursor, limit: Math.min(100, MAX_METRIC_KEYS - keys.size) });
        pages += 1;
      } catch {
        coverage.readErrors += 1;
        break days;
      }
      for (const key of page.keys) {
        if (!key.name.startsWith(prefix)) {
          coverage.readErrors += 1;
          continue;
        }
        if (keys.size >= MAX_METRIC_KEYS) {
          coverage.truncated = true;
          break days;
        }
        keys.add(key.name);
      }
      if (page.list_complete) break;
      if (!page.cursor || cursors.has(page.cursor)) {
        coverage.readErrors += 1;
        break days;
      }
      cursors.add(page.cursor);
      cursor = page.cursor;
    } while (cursor);
  }

  coverage.scannedKeys = keys.size;
  const entries: MetricEntry[] = [];
  const keyList = [...keys];
  // Bound concurrent reads as well as total keys; this endpoint is diagnostic.
  for (let offset = 0; offset < keyList.length; offset += 25) {
    const values = await Promise.allSettled(keyList.slice(offset, offset + 25).map((key) => env.CACHE.get(key)));
    for (const result of values) {
      if (result.status === 'rejected') { coverage.readErrors += 1; continue; }
      if (result.value === null) { coverage.missingEntries += 1; continue; }
      const entry = parseEntry(result.value, stream);
      if (!entry) { coverage.invalidEntries += 1; continue; }
      const at = Date.parse(entry.at);
      if (at >= start && at <= end) entries.push(entry);
    }
  }
  coverage.complete = !coverage.truncated && !coverage.invalidEntries && !coverage.missingEntries && !coverage.readErrors;
  return { entries, coverage };
}

const SUBSCRIPTION_KINDS = new Set<SubscriptionMetricKind>([
  'email_confirmation_sent', 'email_confirmed', 'email_delivered', 'email_bounced',
  'email_complained', 'email_unsubscribed', 'push_registered', 'push_test_delivered',
  'push_test_skipped', 'push_expired_during_test', 'push_unsubscribed', 'push_pruned_after_delivery',
]);

function parseEntry(raw: string, stream: 'subscription' | 'x-webhook'): MetricEntry | null {
  try {
    const value = JSON.parse(raw) as Partial<MetricEntry> | null;
    if (!value || typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at))) return null;
    if (stream === 'subscription') {
      if (!SUBSCRIPTION_KINDS.has(value.kind as SubscriptionMetricKind)
        || typeof value.count !== 'number' || !Number.isSafeInteger(value.count) || value.count < 0) return null;
    } else if (value.kind !== 'x_webhook' || !['completed', 'failed', 'ignored', 'duplicate'].includes(value.outcome || '')) {
      return null;
    }
    return { ...value, at: new Date(value.at).toISOString() } as MetricEntry;
  } catch {
    return null;
  }
}
