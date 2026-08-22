export interface Env {
  CACHE: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  /** Required for every Worker-owned write and private read. */
  SUPABASE_SERVICE_ROLE_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT: string;
  RESEND_API_KEY?: string;
  RESEND_FROM: string;
  /** Cloudflare Turnstile server secret for the public email-intake form. */
  TURNSTILE_SECRET?: string;
  /** Private recipient for deduplicated Worker health-failure alerts. */
  HEALTH_ALERT_EMAIL?: string;
  /** Resend/Svix signing secret for bounce and complaint webhooks. */
  RESEND_WEBHOOK_SECRET?: string;
  UNSUBSCRIBE_SECRET?: string;
  CRON_SECRET?: string;
  RSSHUB_INSTANCES: string;
  TARGET_ACCOUNT: string;
  SITE_URL: string;
}

export interface Tweet {
  text: string;
  link: string;
  ts: number;
}

export interface ScrapeResult {
  ok: boolean;
  instance?: string;
  /** Direct means the configured target account; degraded means news-only discovery. */
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
  sources: {
    tweets: 'live' | 'stale' | 'down';
    statusPage: 'live' | 'down';
    database: 'live' | 'fallback' | 'down';
  };
}

export interface RunReport {
  startedAt: string;
  trigger: string;
  scrape: 'ok' | 'failed';
  scrapeInstance?: string;
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
  /** reset+context mentions that lacked announcement phrasing (never auto-inserted) */
  weakCandidates?: number;
  /** First few candidate excerpts — lets ops eyeball false positives in /api/health */
  candidateSamples?: { tier: 'strong' | 'weak'; ts: string; link: string; text: string }[];
  inserted: number;
  notifiedEmails: number;
  notifiedPush: number;
  errors: string[];
}

export type HealthCheck = 'ok' | 'missing' | 'stale' | 'failed';

export interface HealthChecks {
  lastRun: HealthCheck;
  signals: HealthCheck;
}
