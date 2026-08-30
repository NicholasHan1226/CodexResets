# Codex Resets

[Visit the live dashboard at codexresets.cc](https://codexresets.cc)

`codexresets.cc` is a public dashboard that estimates when OpenAI Codex usage
limits may reset. It combines a browser UI with a scheduled Cloudflare Worker
that collects signals and produces a KV-backed snapshot.

## Production surfaces

| Surface | Purpose |
| --- | --- |
| `https://codexresets.cc` | The only public product domain. |
| `https://codexresets.cc/api/*` | Worker API for signal snapshots and operational health. |
| `codex-resets.pages.dev` | Cloudflare Pages technical hostname; do not promote it as a product URL. |

## Search entry pages

Three English guides under `/guides/` and two Chinese guides under `/zh/` are
static and directly crawlable. They answer narrow, high-intent questions
without adding explanatory clutter to the product UI:

- `/guides/codex-usage-limits/` — personal usage windows versus global events
- `/guides/codex-reset-prediction/` — forecast scope and uncertainty
- `/guides/codex-reset-history/` — verified history versus public noise
- `/zh/codex-usage-limits/` — personal usage windows versus observed global events
- `/zh/codex-reset-prediction/` — what a 24/48-hour probability means

They are intentionally independent HTML files in `public/guides/` and
`public/zh/`, so crawlers and link previews can read them without executing the
dashboard. Keep their claims conservative and update `public/sitemap.xml`
whenever a guide is added or removed.

The Worker runs every 30 minutes. Its public read endpoints are:

- `GET /api/signals` — latest three-source browser snapshot and a bounded,
  model-only verified-reset history, so the first dashboard render does not
  need a separate database round trip.
- `GET /api/health` — coarse latest-run and snapshot freshness only; detailed
  capability and delivery diagnostics stay on the authenticated operations route.
- `GET /api/release-status` — a binary formal-release gate for automation; it
  exposes no calibration details and is `true` only after the private 80%
  production-evidence criterion passes.
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
  activated only by an explicit `POST /api/subscribe/confirm?t=...` action
  within 24 hours. `GET /api/subscribe/confirm` only shows that action.
- `GET /api/unsubscribe` shows an explicit unsubscribe action; signed
  `POST /api/unsubscribe` performs it and also supports mailbox one-click
  unsubscribe (`List-Unsubscribe-Post`).

Email delivery uses Resend. Link tracking is served from
`links.codexresets.cc`; open tracking stays disabled. Cloudflare Web Analytics
is enabled for aggregate product and web-vital metrics. The Worker also has a
protected `POST /api/test-email` delivery exercise for an administrator: it
requires `Authorization: Bearer $CRON_SECRET`, accepts exactly one JSON email
recipient, and never reads subscribers or runs the pipeline.

When configured, the authenticated official X API is the only direct-account
source permitted to create, confirm, or deliver an automated alert or raise an
active public reset signal. A direct official post scheduling a future reset is
shown as a short-lived active planning signal only: it never enters reset history.
The official timeline uses an incremental post-ID watermark, bounded pagination
(50 posts/page, at most eight pages/run), full long-post text, and directly
fetched reply context. A seven-day private KV cache retains official evidence;
successful empty incremental reads are healthy, but a failed or truncated page
sequence never advances the watermark. The limit caps recovery cost at 400
timeline posts per run; ordinary runs fetch only new posts. A pagination-limit
error needs investigation, not silent truncation or an automatic budget increase.
Common announcement spellings and completed-action phrasing are supported;
questions, denials, recurring personal reset rules and future plans are not
confirmations. An affirmative reply needs an explicit global-reset parent
report; unrelated community wording cannot confirm an event. Community parent
text and identities are not archived.

The first seven-day catch-up and notices older than 48 hours are history-only.
Unambiguous direct official evidence without a matching retraction repairs the
existing reset table with `verified=true`, `automated=false`, `auto_state=manual`
(the existing non-delivery lifecycle, not a request for human approval).
Publication time is retained as the observation time, not invented as an exact
account-level execution time. These records update the dashboard/model but
never send a backdated confirmed-reset alert. Normal new events retain the
30-minute stabilization window. Confirmed notification retries expire 48 hours
after the source post. Pending reset discoveries suppress premature forecast
emails based on an obsolete last-reset date.
When the current direct source is healthy, no relevant official incident is
active, and the dashboard's next-24-hour planning likelihood first reaches
70%, the Worker sends one email-only forecast notice per reset cycle. It is
explicitly labelled as a forecast and never as a confirmed reset. RSS/Nitter
and news feeds remain discovery-only operational context. Strong notices from
the configured target account are automatically recorded, held for one
scheduled interval, and then confirmed and delivered. A later direct-source
correction within the stabilization window automatically retracts the matching
pending notice. Notices older than 48 hours and all degraded discovery never
create a forecast or confirmed-reset email alert.
When an exact direct official schedule reaches its stated time, the first
healthy 30-minute collection run sends one separate execution notice. It says
the reset is expected to be live, links the official schedule, and clearly
distinguishes this from a later confirmation post; it never enters reset
history or forecast calibration.
Only while that official due-time window is active, the Worker can use X Recent
Search with the existing app-only token to look for aggregate corroboration.
It requires at least three different authors and three independently worded
post-reset reports before adding a brief corroboration sentence to that
execution notice. The raw posts, accounts, links, and text fingerprints are
not stored or exposed. Community reports never create an alert by themselves,
never confirm a reset, and never alter history, model inputs, or calibration;
an unavailable search endpoint simply has no effect on the official path.
Confirmed alert emails and browser Push messages identify the reset type from
the official announcement wording (banked, direct usage-limit, quota, or
credits). Emails include the escaped announcement excerpt plus a link only
when it is a canonical official `x.com/<account>/status/<id>` post; degraded
feeds and unknown URLs are never forwarded to subscribers.
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
The browser forecast and the Worker's cooldown signal both use this same
canonical episode series, including the reviewed baseline while the live table
is sparse. The annual reset calendar stays hidden until at least 12 reviewed
episodes exist, so early visitors see the denser reset timeline instead of a
mostly empty year grid.
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
When history is recovered after a prediction, affected pending/evaluated
samples are retained with `historyIncomplete=true` and excluded from calibration
and release scoring; past scores are not rewritten into successful predictions.
New forward snapshots can use the corrected history. Backfills create no
synthetic forecasts or historical decision samples.
The dashboard presents exactly one percentage as its primary answer: the
selected 24- or 48-hour probability. The timing chart is deliberately
percentage-free; it highlights the single three-hour period with the highest
relative likelihood inside that selected window, so visitors can see when to
watch without mistaking a chart bucket for the overall forecast. A direct
official target inside that window takes over the highlighted timing block;
this is a display-only alignment with the combined planning answer and never
changes the stored historical curve or calibration.
When a direct official post schedules a future reset, the dashboard keeps the
visitor-facing history-calibrated probability number and curve visible, and
shows the official timing alongside them as a separate strong signal. When the
target is active and inside the chosen horizon, a clearly labelled planning
likelihood combines the history-model value with that direct signal; the
history model itself remains visible and unchanged. It states
whether that target is inside the selected 24/48-hour window (or says that the
time remains unconfirmed) and shows the remaining time from the visitor's
current clock. If a stated target passes before a separate reset confirmation,
the dashboard says exactly that and waits for confirmation; it never continues
to present the past time as upcoming. The history-only model stays in
calibration only, so an announced schedule never contaminates forecast scoring.
The planning likelihood is a transparent, live decision aid rather than a new
calibrated model metric. A stated target remains a strong planning input for a
six-hour execution grace period after it passes; it never raises a window whose
scheduled target is outside it, unknown, or beyond that grace period without a
confirmed reset.
An OpenAI-owned Codex changelog is checked as discovery context only; it can
never create a candidate, raise a forecast, confirm a reset, or send an alert.

## Mainland-user behavior

The public site uses Cloudflare's global network, not a mainland China
deployment, and does not claim a mainland-network SLA or ICP filing. When the
Worker API is unreachable, the browser shows an explicit unavailable state
rather than trying multiple third-party RSS/status hosts or showing a local
prediction. Email is the primary alert channel and uses concise bilingual
English/Chinese messages; Web Push remains optional because device, browser,
and notification policies vary across mainland networks and mobile platforms.

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
Worker API or VAPID public key were not embedded in the
bundle, preventing a release that silently falls back to browser-only data.

## Public browser configuration

`.env.production` is committed intentionally. Its `VITE_*` values are public
and become part of the downloaded browser bundle:

- `VITE_PIPELINE_API_URL`
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

The managed database is Supabase project `wwhypilqiognyxkpqkss`. The browser
receives verified reset history through the Worker snapshot and shows an
explicit unavailable state when that snapshot is unavailable; all
subscription, push, and pipeline writes require the Worker-only
`SUPABASE_SERVICE_ROLE_KEY` secret in Cloudflare. Anonymous reads are limited
to `id`, `reset_date`, and `verified` for verified reset history; source URLs,
original text, pending and retracted lifecycle rows remain Worker-only. Apply
all migrations in `supabase/migrations/` before release.

Resend remains the email delivery provider. Moving the database does not
change its API key, verified sender domain, or mail routing.

Forecast, official-schedule execution, and confirmed-alert fan-out use the
existing globally serialized pipeline coordinator. The forecast path is
email-only: it sends once when the next-24-hour planning likelihood reaches
70%, and its campaign identity is tied to the last confirmed reset so it
cannot repeat in the same reset cycle. A direct official schedule gets its own
once-only due-time notice after its stated time arrives; that notice remains
explicitly non-confirming and does not alter reset history.
For an active due-time window, the same run may add aggregate corroboration
from X Recent Search only after three distinct authors give independently
worded post-reset reports. It retains no community post content or identity;
this is supplementary execution evidence, not a confirmation or a new signal
source for the model.
It records a 31-day keyed digest for each successfully delivered recipient,
never the email address or Push endpoint itself. A temporary failure therefore
retries only the missing recipient on the next automatic pipeline run. Each
run is deliberately bounded to 50 emails and 50 Push endpoints per channel;
any remainder continues automatically on later runs without needing a separate
queue service at the current subscriber scale.

## Delivery

### Cloudflare Pages

The Pages project is `codex-resets`. Its intended Git integration is
`NicholasHan1226/CodexResets`, production branch `main`, build command
`pnpm --dir worker install --frozen-lockfile && pnpm run quality:cloudflare`, and output directory `dist`.
That makes Cloudflare build a preview for pull requests and publish production
after a successful build of `main`.

The dashboard uses a static `/about/` entry (with `/about` canonicalizing to
that path) and `public/404.html` for unknown routes. This prevents missing or
scanner-generated paths from being served as the dashboard and counted as
normal page traffic.

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
curl -s -o /dev/null -w '%{http_code}\n' https://codexresets.cc/not-a-real-page
curl -sSI https://codexresets.cc/ | grep -i '^strict-transport-security:'
```

The last command must return `404`.

Cloudflare sets HSTS at the zone level with a one-month `max-age`. Keep
`includeSubDomains` and preload disabled: Resend owns the separate
`links.codexresets.cc` tracking hostname, so it must not inherit a product
domain policy by accident.

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

## License

[MIT](LICENSE) — reuse, modification, and commercial distribution are allowed
when the copyright and license notice are retained.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the project scope, local quality
gate, and safe bug-reporting guidance.

## Security

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/NicholasHan1226/CodexResets/security/advisories/new).
See [SECURITY.md](SECURITY.md) for scope and reporting guidance.
