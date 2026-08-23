/**
 * Public bindings are generated from wrangler.toml in
 * worker-configuration.d.ts. Keep only dashboard-managed secrets here: they
 * deliberately do not appear in source control or the generated config type.
 */
export interface Env extends Cloudflare.Env {
  /** Required for every Worker-owned write and private read. */
  SUPABASE_SERVICE_ROLE_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  RESEND_API_KEY?: string;
  /** Cloudflare Turnstile server secret for the public email-intake form. */
  TURNSTILE_SECRET?: string;
  /** Private recipient for deduplicated Worker health-failure alerts. */
  HEALTH_ALERT_EMAIL?: string;
  /** Resend/Svix signing secret for bounce and complaint webhooks. */
  RESEND_WEBHOOK_SECRET?: string;
  /** Optional official X API app-only token for the direct account timeline. */
  X_BEARER_TOKEN?: string;
  /** X app Consumer Secret, used only to authenticate X Activity webhooks. */
  X_CONSUMER_SECRET?: string;
  UNSUBSCRIBE_SECRET?: string;
  CRON_SECRET?: string;
}

export interface Tweet {
  text: string;
  link: string;
  ts: number;
}

export interface ScrapeResult {
  ok: boolean;
  instance?: string;
  /** Direct means authenticated target-account evidence; degraded means discovery-only context. */
  sourceKind?: 'direct' | 'degraded';
  tweets: Tweet[];
  error?: string;
  attempted?: string[];
}

export interface ResetEvent {
  ts: number;
  text: string;
  link: string;
}

export interface ResetRecordRow {
  id: string;
  reset_date: string;
  source_url: string | null;
  description: string | null;
  verified: boolean;
  /** Worker-managed automated lifecycle. Manual historical rows remain false. */
  automated?: boolean;
  auto_state?: 'manual' | 'observed' | 'confirmed' | 'retracted';
  auto_confirm_after?: string | null;
  retracted_at?: string | null;
  created_at?: string;
  /** Set after a confirmed reset has been delivered to subscribers. */
  notified_at?: string | null;
}

export type SignalStatus = 'active' | 'weak' | 'idle';

export interface SignalSnapshot {
  source: string;
  label: string;
  status: SignalStatus;
  value: number;
  description: string;
  descriptionParams?: Record<string, string | number>;
  updatedAt: number;
  sourceUrl?: string;
}

export interface SignalsPayload {
  signals: SignalSnapshot[];
  generatedAt: number;
  /** Public, model-only reset fields delivered with the fresh Worker snapshot. */
  history: PublicResetHistory[];
  sources: {
    tweets: 'live' | 'stale' | 'down';
    statusPage: 'live' | 'down';
    database: 'live' | 'fallback' | 'down';
  };
}

export interface PublicResetHistory {
  id: string;
  reset_date: string;
  verified: true;
}

export interface DeliveryLedger {
  hasDelivered(resetId: string, channel: 'email' | 'push', recipient: string): Promise<boolean>;
  markDelivered(resetId: string, channel: 'email' | 'push', recipient: string): Promise<void>;
}

export interface RunReport {
  startedAt: string;
  trigger: string;
  scrape: 'ok' | 'failed';
  scrapeInstance?: string;
  /** Direct target-account availability is distinct from a news fallback. */
  directSource?: 'live' | 'degraded' | 'down';
  /** Consecutive non-direct runs, reset after a direct target-account read. */
  directSourceFailures?: number;
  /** An official Codex/rate-limit incident pauses automated confirmation. */
  statusGate?: 'clear' | 'hold' | 'unavailable';
  tweetsSeen: number;
  candidates: number;
  /** Automatically discovered records entering the stabilization window. */
  pendingInserted?: number;
  /** Existing or newly observed records queued for automatic confirmation. */
  autoQueued?: number;
  /** Records promoted without human intervention after the stabilization window. */
  autoConfirmed?: number;
  /** Pending automated records withdrawn after a later correction signal. */
  autoRetracted?: number;
  /** Stable candidates held because the official status page reports an incident. */
  autoHeldByStatus?: number;
  /** reset+context mentions that lacked announcement phrasing (never auto-inserted) */
  weakCandidates?: number;
  /** Strong direct-source matches older than the automatic delivery window. */
  staleCandidates?: number;
  /** First few candidate excerpts — lets ops eyeball false positives in /api/health */
  candidateSamples?: { tier: 'strong' | 'weak'; ts: string; link: string; text: string }[];
  inserted: number;
  notifiedEmails: number;
  notifiedPush: number;
  /** Invalid 404/410 browser endpoints pruned while delivering a real alert. */
  prunedPushEndpoints?: number;
  errors: string[];
}

/** A compact, non-PII operational roll-up retained in KV for 31 days. */
export interface DeliveryMetrics {
  date: string;
  runs: number;
  directRuns: number;
  degradedRuns: number;
  failedRuns: number;
  candidates: number;
  staleCandidates: number;
  autoQueued: number;
  autoConfirmed: number;
  autoRetracted: number;
  statusHeld: number;
  emails: number;
  pushes: number;
  /** Invalid 404/410 endpoints pruned after a real reset delivery. */
  prunedPushEndpoints: number;
  errors: number;
}

export type HealthCheck = 'ok' | 'missing' | 'stale' | 'failed';

export interface HealthChecks {
  lastRun: HealthCheck;
  signals: HealthCheck;
}
