# AGENTS.md

## Project Overview
**Codex Resets** — A real-time prediction dashboard for OpenAI Codex usage limit resets. Uses verified-history interval models for probabilities and separate official signals for planning.

**Product focus**: visitors come to SEE the reset probability and SHARE it. No accounts, no personal usage tracking (Codex client already provides those). Anonymous-first: email/push alerts use the email/endpoint as identity.

## Tech Stack
- **Framework**: Vite 7 + React 19 + TypeScript 5
- **Styling**: Tailwind CSS 3.4 + shadcn/ui (New York style)
- **Charts**: Hand-rolled SVG (no chart library)
- **Router**: React Router 7
- **Icons**: Lucide React

## Commands
```bash
pnpm install          # Install dependencies
pnpm run dev          # Start dev server (Vite HMR)
pnpm run build        # Production build
pnpm run lint         # ESLint check
pnpm run quality:cloudflare # Pages quality gate: lint, tests, frontend/Worker validation
npx tsc -b --noEmit  # TypeScript check
```

## Backend Pipeline (worker/)
`codex-resets-pipeline` — Cloudflare Worker, cron `*/30 * * * *`, served at
`https://codexresets.cc/api/*` (a scoped Worker route on the primary domain;
workers.dev is DNS-poisoned in some regions — do not rely on it).

- `src/scrape.ts`    — optional official X API → RSSHub instances → nitter
  mirrors → Google News RSS degraded source for reset detection. Failed
  primary attempts remain in `attempted[]`; a populated degraded source keeps
  the run healthy.
  Direct X reads use an incremental watermark, up to 8 pages of 50 posts,
  full-text/reply context, and a 7-day private evidence cache. Never advance
  the watermark on partial failure or a pagination cap. Bootstrap/old events
  are history-only; do not replay them as fresh subscriber alerts.
- `src/signals.ts`   — builds the 3-source snapshot (tibopost / status_page /
  cooldown), mirrors the frontend model. Derived timing arithmetic is never
  exposed as a separate evidence source.
- `src/pipeline.ts`  — orchestration: scrape → detect → direct-source
  stabilization → automatic correction/confirmation → notify → snapshot to KV
  (`signals:latest`) → health report (`health:last_run`). Every cron, webhook, and manual trigger
  enters the globally addressed `PipelineCoordinator` Durable Object first, so
  discovery, confirmation, and delivery remain a single-writer workflow.
  Sequencing uses an awaited request chain, not a `blockConcurrencyWhile`
  gate around external I/O. Run `pnpm run test:runtime` after coordinator or
  persistence changes; it uses local fixtures and never real subscriptions.
- `src/forecast.ts`  — private daily prediction snapshots and automatic
  24/48-hour outcome resolution through a single-writer Durable Object ledger;
  7/14/30 review thresholds and a
  seven-sample Brier trend are private operations evidence, never visitor copy
- `src/discovery.ts` — isolated OpenAI-owned Codex update discovery context;
  it never becomes a reset candidate or notification input
- `src/notify.ts`    — Resend email (HMAC-signed unsubscribe links) +
  Web Push via @block65/webcrypto-web-push (prunes 404/410 endpoints), with
  bounded fan-out and outbound timeouts. Prepared mail is immutable across
  retries and stores a recipient placeholder, never the address. Persist
  success per recipient; stop ambiguous retries after 23 hours. Preserve the
  current forecast cycle through 31-day pruning, and paginate subscriber reads
  with oldest-attempt scheduling so failing recipients cannot block new ones.
- `src/operational-metrics.ts` — append-only, non-PII KV telemetry for
  subscription conversion/delivery and signed X webhook pipeline outcomes;
  use unique event keys rather than a shared request-time counter because KV
  writes to one key are rate-limited. Private summaries include coverage and
  truncation metadata, prioritize recent UTC days, and retain at most 500
  events. Event-count ratios are not cohort conversion rates.
- Runtime compatibility: `nodejs_compat` is enabled because the Web Push
  library imports `node:crypto`.
- `src/routes.ts`    — GET /api/signals, public GET /api/health, protected
  GET /api/health/details,
  POST /api/subscribe/push, POST /api/unsubscribe/push,
  GET/POST /api/unsubscribe (HMAC email; GET confirms, POST executes),
  POST /api/webhooks/resend (Svix-signed),
  GET/POST /api/webhooks/x (X CRC + signed Activity events),
  POST /api/run (Bearer CRON_SECRET)
- Deploy: `cd worker && CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx wrangler deploy`
- Secrets set: SUPABASE_SERVICE_ROLE_KEY, VAPID_PRIVATE_KEY,
  UNSUBSCRIBE_SECRET, CRON_SECRET, RESEND_API_KEY (send-only restricted key),
  TURNSTILE_SECRET, HEALTH_ALERT_EMAIL, RESEND_WEBHOOK_SECRET, optional
  X_BEARER_TOKEN, X_CONSUMER_SECRET. The X webhook only accelerates the
  existing official-timeline pipeline; it never bypasses stabilization or
  creates an alert from an unverified payload.
- Privileged DB access (`src/privileged.ts`) is service-role REST only. No
  database RPC accepts a shared pipeline secret or anonymous caller.
- Resend remains the outbound email delivery provider; it is independent of
  the Supabase database migration.

### Database state (Supabase project `wwhypilqiognyxkpqkss`)
- `reset_records` — RLS on + verified-only SELECT policy. Anonymous browser
  access is column-limited to `id`, `reset_date`, and `verified`; all other
  fields and writes are service-role-only.
- `subscriptions` — RLS on, zero public policies; double-opt-in confirmation
  is completed by the Worker service role.
- `push_subscriptions` — RLS on, zero public policies; Worker upserts with
  `?on_conflict=endpoint` using the service role.
- WARNING: with RLS on and no policies, PostgREST SELECT returns `[]`
  silently — an "empty table" REST response does NOT prove emptiness.
  Verify via `exec_sql` before concluding anything about row counts.

### Automated reset delivery

- When the direct source is healthy, no relevant official incident is active,
  and the dashboard's next-24-hour planning likelihood first reaches 70%, the
  Worker sends one email-only forecast notice per reset cycle. Its identity is
  anchored to the last confirmed reset, it is clearly not a confirmation, and
  browser Push remains reserved for confirmed resets.
- When an exact direct official scheduled time arrives, the first healthy
  collection run sends one email-only execution notice. It says the reset is
  expected to be live, remains distinct from confirmation, and never changes
  reset history, model inputs, or calibration evidence.
- During that same short due-time window, the Worker may query X Recent Search
  with the existing app-only token for aggregate corroboration only. It needs
  at least three distinct authors and independently worded post-reset reports;
  raw post text, links, usernames, and identifiers are neither persisted nor
  exposed. This can add one short sentence to the due-time email, but never
  confirms a reset, changes history/calibration, or creates an alert without
  the direct official schedule. If search access is unavailable it fails closed
  without affecting the official pipeline.
- A strong announcement from a direct target-account source enters an
  `observed` state for one cron interval (30 minutes). The Worker then confirms
  and notifies automatically; no Supabase dashboard action is required. The
  coordinator serializes all run triggers before any database read or delivery.
- Once a matching completion is present in verified reset history, its Tibo
  radar entry and same-episode follow-ups are idle confirmation context, never
  an active or weak signal for another future reset. A newer future schedule
  still takes priority.
- First-pass recovery and posts older than 48h can repair history only from
  unambiguous direct evidence without a matching retraction. Use the existing
  verified, non-automated `manual` lifecycle to prevent delivery; preserve
  `created_at` as discovery provenance. Affected historical forecast samples
  remain stored but excluded (`historyIncomplete`), never converted to hits.
  See README's source/forecast sections for collection and delivery bounds.
- A later direct-source correction in the 72-hour correction window changes a
  still-pending automated record to `retracted`, so it cannot affect the model
  or subscriber delivery. Corrections must match the reset topic (banked,
  limits, quota, or credits), and alerts older than 48 hours are discarded.
  Google News remains discovery-only and cannot create an alert.
- Three consecutive non-direct collection runs produce a rate-limited health
  alert and keep automatic confirmation paused. An active official Codex or
  usage-limit incident is a contradiction gate: it can hold delivery but never
  creates a reset. KV retains a 31-day non-PII delivery roll-up plus private
  conversion, bounce/complaint, Push-test/prune, and X receipt-to-pipeline
  summaries; do not expose any of them in public UI or health responses.
- Forecast calibration retains one non-PII snapshot per UTC day and resolves
  its 24/48-hour outcomes after the horizon closes and overlapping candidates
  stabilize on a healthy direct collection. Late automatic confirmation
  corrects original outcome labels without rewriting predictions. The private forecast
  evidence is retained for 120 days; it is not public product copy. At 7, 14,
  and 30 resolved samples, and on a material seven-sample Brier degradation,
  it may notify the existing operations recipient once per review key.
- Formal-release forecast accuracy is a protected 48-hour high-confidence
  decision gate: at least 20 resolved decisions and five positive predictions,
  with both overall decision accuracy and positive precision >=80%. Do not
  call an imbalanced no-reset baseline "80% accurate". Worker snapshots and
  the browser must use the same forward-looking, history-only probability.
- When the Worker cannot be reached, production browsers show an explicit
  unavailable state instead of a locally recomputed prediction or third-party
  browser-side proxy reads. Email is the primary alert channel; Web Push is
  optional for browsers that support it.

## Project Structure
```
src/
├── components/ui/     # shadcn/ui components (button, card — only what's used)
├── contexts/          # I18nContext (en/zh)
├── hooks/             # Snapshot state and subscription operations
├── lib/               # Utilities (cn, prediction model, i18n, export-share)
├── pages/             # Home (dashboard), About (/about docs page)
├── sections/          # Dashboard sections (doc-flow, no cards)
│   ├── StatusHeader.tsx      # Sticky header: snapshot age, navigation, language, refresh
│   ├── HeroSection.tsx       # Outlook + timing curve + compact probability
│   ├── ProbabilityDisplay.tsx# Primary probability + 24h/48h comparison
│   ├── ProbabilityCurve.tsx  # Area chart, filters to next 24/48h (hours prop)
│   ├── SignalPanel.tsx       # Signal timeline feed (ACTIVE/WARM/IDLE)
│   ├── TimeDistribution.tsx  # Reset time-of-day distribution bars
│   ├── HistoryPanel.tsx      # Reset rhythm sparkline + recent reset timeline
│   ├── ResetCalendar.tsx     # GitHub-style reset heatmap
│   ├── ResetAlertsPanel.tsx  # Email + push subscription
├── types/             # TypeScript type definitions
├── App.tsx            # Root router (/ and /about)
├── main.tsx           # Entry point
└── index.css          # Global styles + theme tokens
```

`public/guides/` and `public/zh/` contain directly crawlable, static
search-entry guides. They are deliberately separate from the React dashboard:
do not introduce browser data access, visitor tracking, or live prediction
claims into those pages. Keep their links and `public/sitemap.xml` synchronized.

## Code Style
- Use `@/` path alias for all imports
- shadcn/ui components in `src/components/ui/`
- Section components are self-contained dashboard modules
- Dark theme only — CSS variables in `index.css`
- System monospace font stack for data/numbers; no remote font dependency

## Key Patterns
- `usePrediction` starts with the dashboard skeleton, then resolves the fresh
  Worker snapshot (signals plus verified history) and refreshes every 5
  minutes. When the Worker is unavailable, it shows an explicit unavailable
  state rather than opening a visitor-side Supabase request or bundled model.
- Signals: production uses only the pipeline snapshot
  (`VITE_PIPELINE_API_URL/api/signals`); an unavailable snapshot never becomes
  a local forecast. Worker snapshot descriptions are i18n keys (`signals.*`)
  rendered via `t()`.
  A snapshot older than 90 minutes (or implausibly future-dated) is unavailable,
  never `LIVE`.
- Simulated-fallback honesty: when network sources fail, signals must say
  "unavailable" (idle, low value) — never fabricate activity from cooldown
  arithmetic. Cooldown is the only honestly computable offline signal
  (watch units: `computeIntervalStats().medianDays` is ALREADY in days)
- Model layer emits no display copy: advice is `{ level }` → `advice.<level>`
  i18n keys; signal descriptions are i18n keys + `descriptionParams`
- Hand-rolled SVG for data visualization (Recharts removed — see Performance)
- CSS variables for theming (HSL format)
- Home holds `timeframe` state (24|48) shared by HeroSection + ProbabilityCurve
- Header navigation holds email alerts, sharing and the prediction guide.
  Use consistent 44px controls. Mobile keeps brand/alerts visible and discloses
  secondary controls in a dismissible menu; keep anchor offsets below the header.
- Share: `buildShareSummary()` emits a Wordle-style terminal text (ASCII bar +
  waited/median), copied with the clean root URL — no state params in the URL
  (they were never read back; the destination always shows fresher live data)
- No localStorage-backed user features except locale preference. Forecast
  accuracy evidence is server-owned; pending email is never an active subscription.
- Show actual verified-history count. Highlight the model-relative timing peak
  when history and future timing data exist; fewer than 12 episodes must show
  a sparse-history caveat. A highlighted interval is not confirmed timing.
- Keep the subscription section after the primary answer and before deeper
  evidence. Explain all three email classes; Push remains confirmed-only.
  Email submission opens an on-demand Turnstile dialog; verification continues
  the captured request once. Cancellation preserves the email and sends nothing.
- `pnpm run report:traffic` reads production-host Web Analytics with explicit
  periods, bot separation and sampling flags. Never equate Visits with people.
  Block RUM requests during browser QA so tests do not inflate product traffic.
- `public/sw.js` is hand-written **plain JS** served as-is — never add TS
  syntax (type annotations break SW registration in browsers). Icons it and
  manifest.json reference live in `public/icons/` (PIL-generated, favicon motif)
- i18n discipline: every `t('key')` must exist in BOTH en/zh dictionaries —
  audit with a key cross-reference script after touching copy (missing keys
  render as raw `[key]` on screen)

## Performance (do not regress)
- Charts are hand-rolled SVG (ProbabilityCurve) — recharts was removed from
  the bundle; do not re-add a charting library without lazy-loading it
- The browser never imports a Supabase client; verified history arrives from
  the Worker snapshot so public database configuration stays out of the bundle
- vite.config `manualChunks` lists ONLY eager vendors (react/ui); adding
  other deps there would force them onto the critical path
- About page is route-level code-split in App.tsx
- System font stacks render immediately; do not reintroduce remote font requests
- Deeper Home evidence is inside one native `<details>` disclosure; its panels
  use `.cv-auto` (content-visibility: auto). Keep the main answer and email form
  visible without opening the evidence. Home shares one clock with the header
  and curve; snapshot state is loading/ready/refreshing/unavailable.

## Deployment
- Cloudflare Pages: `codexresets.cc` (project `codex-resets`)
- The Pages Git build command is `pnpm --dir worker install --frozen-lockfile && pnpm run quality:cloudflare`; it is the only CI quality gate. Do not reintroduce a duplicate GitHub Actions workflow without an explicit branch-protection requirement.
- Cloudflare Worker: `codex-resets-pipeline` builds production from `NicholasHan1226/CodexResets` branch `main`, root `/worker`, with `pnpm install --frozen-lockfile && pnpm exec tsc --noEmit`, then `pnpm exec wrangler deploy`. Runtime secrets remain dashboard-managed.
- Deploy: `CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx wrangler pages deploy dist --project-name=codex-resets --commit-dirty=true`
- Supabase: email subscriptions (`subscriptions` table) + reset records

### Banked reset announcement context

Keep official banked grant updates separate from global forecast signals and
confirmed reset delivery. Never count posts as grants or promote elapsed
promises to account receipt. The public `bankedNotices` contract and freshness
bounds are documented in README; `tests/banked-notices.test.ts` covers source
recognition through browser parsing.
