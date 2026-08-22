# Codex Resets

`codexresets.cc` is a public dashboard that estimates when OpenAI Codex usage
limits may reset. It combines a browser UI with a scheduled Cloudflare Worker
that collects signals and produces a KV-backed snapshot.

## Production surfaces

| Surface | Purpose |
| --- | --- |
| `https://codexresets.cc` | The only public product domain. |
| `https://codexresets.cc/api/*` | Worker API for signal snapshots and operational health. |
| `codex-resets.pages.dev` | Cloudflare Pages technical hostname; do not promote it as a product URL. |

The Worker runs every 30 minutes. Its public read endpoints are:

- `GET /api/signals` — latest four-signal browser snapshot.
- `GET /api/health` — coarse latest-run and snapshot freshness only; detailed
  capability and delivery diagnostics stay on the authenticated operations route.
- `GET /api/health/details` — full diagnostics for an administrator with the
  `CRON_SECRET` bearer token; raw upstream errors are excluded from public
  health.

Public subscription intake uses a per-client Durable Object quota, so concurrent
requests cannot race the quota counter. The quota state is isolated by hashed
client address and scope; it does not store the address itself.

Forecast snapshots and their 48-hour outcomes are written through a separate
private Durable Object ledger. This keeps cron and signed-webhook runs from
losing or double-settling calibration evidence. Its first write carries over
only pre-existing, still-future KV samples once, so an in-flight forecast is
not discarded during the ledger migration.
- `POST /api/subscribe/email` — starts a confirmation email; the address is
  activated only by `GET /api/subscribe/confirm?t=...` within 24 hours.

Email delivery uses Resend. Link tracking is served from
`links.codexresets.cc`; open tracking stays disabled. Cloudflare Web Analytics
is enabled for aggregate product and web-vital metrics. The Worker also has a
protected `POST /api/test-email` delivery exercise for an administrator: it
requires `Authorization: Bearer $CRON_SECRET`, accepts exactly one JSON email
recipient, and never reads subscribers or runs the pipeline.

When configured, the authenticated official X API is the only direct-account
source permitted to create, confirm, or deliver an automated alert or raise an
active public reset signal. RSS/Nitter and news feeds remain discovery-only
operational context. Strong notices from
the configured target account are automatically recorded, held for one
scheduled interval, and then confirmed and delivered. A later direct-source
correction within the stabilization window automatically retracts the matching
pending notice. Notices older than 48 hours and all degraded discovery never
create an email alert.
After three consecutive direct-source failures, the Worker raises a health alert
and keeps automated confirmation paused. An active official Codex/rate-limit
incident also holds confirmation; status-page availability alone never creates
a reset. Daily non-PII run and delivery metrics are retained in Worker KV for
31 days and exposed only through the operational health response. The same
private response also aggregates double-opt-in conversion, bounce/complaint,
browser Push test/pruning, and signed X webhook-to-pipeline outcomes from
append-only, non-PII event records; no email address, endpoint, or X payload is
stored in those metrics.
Resend `email.bounced` and `email.complained` webhooks are HMAC-verified at
`POST /api/webhooks/resend` and delete the affected subscription.
X Activity `post.create` events are received at
`GET|POST /api/webhooks/x`: GET performs X's recurring CRC proof and signed
POST deliveries only accelerate a fresh official-timeline pipeline run. They
do not bypass the stabilization or correction window.

## Forecast behavior

The forecast groups related announcement, clarification, and completion posts
within 24 hours into one reset episode. This prevents one product reset from
being counted as several short reset intervals. On each refresh, the browser
backtests logistic and Weibull interval models against earlier time-ordered
24/48-hour cutoffs and uses the lower-Brier candidate when enough historical
samples are available. Direct-source reset announcements are used only for the
Worker's automatic stabilization, correction, and notification rules; they do
not alter the future-facing probability.
The Worker also retains one non-PII forecast snapshot per UTC day and resolves
its 24/48-hour outcome after the horizon closes. These private KV samples are
kept for 120 days and are not shown in the visitor interface.
The protected `/api/health/details` response includes the resulting sample
count, 24/48-hour Brier scores, model usage counts, and the latest snapshot.
For the formal-release accuracy target, it also reports 48-hour
high-confidence decision accuracy: only predictions at or above 80%, or at or
below 20%, qualify. The target passes only after at least 20 resolved decisions
and five positive predictions, with both overall decision accuracy and positive
prediction precision at or above 80%. This prevents a no-reset majority from
being presented as predictive accuracy.
It automatically marks private 7/14/30-sample review thresholds and compares
the latest seven resolved forecasts with the preceding seven; milestones and a
measurable degradation send one rate-limited operations email when configured.
This never changes the public UI or bypasses the browser model's existing
time-ordered model selection.
Direct reset announcements are already-observed information, so they are not
part of the browser or Worker probability model. Legacy private snapshots that
contained one are excluded from calibration and formal release scoring.
An OpenAI-owned Codex changelog is checked as discovery context only; it can
never create a candidate, raise a forecast, confirm a reset, or send an alert.

## Mainland-user behavior

The public site uses Cloudflare's global network, not a mainland China
deployment, and does not claim a mainland-network SLA or ICP filing. When the
Worker API is unreachable, the browser remains usable with its local prediction
model rather than trying multiple third-party RSS and status hosts. Email is
the primary alert channel and uses concise bilingual English/Chinese messages;
Web Push remains optional because device, browser, and notification policies
vary across mainland networks and mobile platforms.

The first render has no third-party font dependency: it uses the platform font
stack, including PingFang SC and Microsoft YaHei where available. This avoids
an avoidable blocked-font request on constrained mainland networks.

Every successful browser Push subscription receives an immediate, clearly
labelled test notification. The Worker accepts only supported browser-push
authorities, applies an IP quota before storage, never follows endpoint
redirects, and removes `404`/`410` stale endpoints automatically.

## Local development

```bash
pnpm install
pnpm run dev
pnpm run lint
pnpm test
pnpm run build
```

`pnpm run build` includes a production-bundle check. It fails when the public
Worker API, Supabase endpoint, or VAPID public key were not embedded in the
bundle, preventing a release that silently falls back to browser-only data.

## Public browser configuration

`.env.production` is committed intentionally. Its `VITE_*` values are public
and become part of the downloaded browser bundle:

- `VITE_PIPELINE_API_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_VAPID_PUBLIC_KEY`
- `VITE_TURNSTILE_SITE_KEY`

Never put a service-role key, `CRON_SECRET`, VAPID private key, Resend API key,
or any other secret in an `VITE_*` variable or this file.

For a stable primary source, configure the optional Worker secret
`X_BEARER_TOKEN` with an app-only X API bearer token. To receive real-time X
Activity `post.create` events, also configure `X_CONSUMER_SECRET` (the X app
Consumer Secret) and register `https://codexresets.cc/api/webhooks/x` in
the X Developer Console. Webhook deliveries are authenticated with that secret
and only accelerate a fresh official-timeline read; they never create an alert
directly. Without the bearer token, the Worker may still show degraded
discovery context but does not create, confirm, or deliver an automated alert.

Email subscription intake requires a Cloudflare Turnstile token with the
`subscribe_email` action. Configure its server-side `TURNSTILE_SECRET` as a
Worker secret; the public site key is the only Turnstile value embedded in the
Pages bundle. The Worker also limits each hashed client address to five email
subscription attempts per ten minutes.

## Database and email delivery

The managed database is Supabase project `wwhypilqiognyxkpqkss`. The public
browser bundle may use only the publishable key to read reset history; all
subscription, push, and pipeline writes require the Worker-only
`SUPABASE_SERVICE_ROLE_KEY` secret in Cloudflare. Anonymous reads are limited
to `id`, `reset_date`, and `verified` for verified reset history; source URLs,
original text, pending and retracted lifecycle rows remain Worker-only. Apply
all migrations in `supabase/migrations/` before release.

Resend remains the email delivery provider. Moving the database does not
change its API key, verified sender domain, or mail routing.

## Delivery

### Cloudflare Pages

The Pages project is `codex-resets`. Its intended Git integration is
`NicholasHan1226/CodexResets`, production branch `main`, build command
`pnpm --dir worker install --frozen-lockfile && pnpm run quality:cloudflare`, and output directory `dist`.
That makes Cloudflare build a preview for pull requests and publish production
after a successful build of `main`.

Cloudflare Pages is the only quality gate. `quality:cloudflare` runs frontend
lint, unit tests, the production bundle check, Worker TypeScript validation,
and a Worker bundle dry run before assets are published. GitHub Actions is
deliberately not used for this project.

For an emergency/manual Pages release, deploy a validated `dist/` through the
dashboard or with an authorized Wrangler session:

```bash
npx wrangler pages deploy dist --project-name=codex-resets
```

### Cloudflare Worker

The Worker source is in `worker/`. It uses `nodejs_compat` because the Web Push
library imports `node:crypto`. `worker/worker-configuration.d.ts` is generated
by Wrangler from the Worker configuration and must remain current; the
Cloudflare quality gate verifies it before compiling. Production observability
is enabled with full head sampling for Worker failures and traces; it does not
add public diagnostics or log subscription content.

The `codex-resets-pipeline` Worker is connected to
`NicholasHan1226/CodexResets`: Cloudflare builds `main` from the `/worker` root,
runs `pnpm install --frozen-lockfile && pnpm exec wrangler types --check && pnpm exec tsc --noEmit`, then deploys
with `pnpm exec wrangler deploy`. This is the production delivery path for
Worker changes; its account-scoped deployment token and runtime secrets stay
in Cloudflare.

```bash
# Emergency/manual deployment only (requires a locally supplied token)
pnpm --dir worker exec tsc --noEmit
pnpm --dir worker exec wrangler deploy --dry-run
pnpm --dir worker exec wrangler deploy
```

Use the existing `codex-resets-pipeline` Worker route at
`codexresets.cc/api/*`. Worker secrets stay in Cloudflare; they are never
committed.

## Release checks and rollback

After a Pages or Worker release, verify:

```bash
curl --fail-with-body https://codexresets.cc/api/health
curl --fail-with-body https://codexresets.cc/api/signals
```

For Pages, confirm that the deployed JavaScript references
`https://codexresets.cc` and that the UI reflects the latest snapshot. If
a release regresses, use the prior successful Cloudflare Pages deployment;
for the Worker, roll traffic back to the prior Worker version in the
Cloudflare dashboard.

`/api/health` is a monitor-ready endpoint: it returns HTTP 503 when the last
scheduled run or signal snapshot is missing, failed, or older than 90 minutes.
The Worker sends one Resend health-failure alert every six hours when
`HEALTH_ALERT_EMAIL` is configured for non-source processing errors or three
consecutive direct-source failures. The response includes non-secret check
states for diagnosis.
