# AGENTS.md

## Project Overview
**Codex Resets** — A real-time prediction dashboard for OpenAI Codex usage limit resets. Uses a signal-based model to estimate reset timing with probability curves.

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
`https://api.codexresets.cc` (custom domain; workers.dev is DNS-poisoned in
some regions — do not rely on it).

- `src/scrape.ts`    — optional official X API → RSSHub instances → nitter
  mirrors → Google News RSS degraded source for reset detection. Failed
  primary attempts remain in `attempted[]`; a populated degraded source keeps
  the run healthy.
- `src/signals.ts`   — builds the 4-signal snapshot (tibopost / status_page /
  cooldown / launch_noise), mirrors the frontend model
- `src/pipeline.ts`  — orchestration: scrape → detect → direct-source
  stabilization → automatic correction/confirmation → notify → snapshot to KV
  (`signals:latest`) → health report
  (`health:last_run`)
- `src/notify.ts`    — Resend email (HMAC-signed unsubscribe links) +
  Web Push via @block65/webcrypto-web-push (prunes 404/410 endpoints)
- Runtime compatibility: `nodejs_compat` is enabled because the Web Push
  library imports `node:crypto`.
- `src/routes.ts`    — GET /api/signals, public GET /api/health, protected
  GET /api/health/details,
  POST /api/subscribe/push, POST /api/unsubscribe/push,
  GET /api/unsubscribe (HMAC email), POST /api/webhooks/resend (Svix-signed),
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
- `reset_records` — RLS on + policy `public read reset records` (SELECT to
  anon/authenticated). Writes: service role only.
- `subscriptions` — RLS on, zero public policies; double-opt-in confirmation
  is completed by the Worker service role.
- `push_subscriptions` — RLS on, zero public policies; Worker upserts with
  `?on_conflict=endpoint` using the service role.
- WARNING: with RLS on and no policies, PostgREST SELECT returns `[]`
  silently — an "empty table" REST response does NOT prove emptiness.
  Verify via `exec_sql` before concluding anything about row counts.

### Automated reset delivery

- A strong announcement from a direct target-account source enters an
  `observed` state for one cron interval (30 minutes). The Worker then confirms
  and notifies automatically; no Supabase dashboard action is required.
- A later direct-source correction in the 72-hour correction window changes a
  still-pending automated record to `retracted`, so it cannot affect the model
  or subscriber delivery. Corrections must match the reset topic (banked,
  limits, quota, or credits), and alerts older than 48 hours are discarded.
  Google News remains discovery-only and cannot create an alert.
- Three consecutive non-direct collection runs produce a rate-limited health
  alert and keep automatic confirmation paused. An active official Codex or
  usage-limit incident is a contradiction gate: it can hold delivery but never
  creates a reset. KV retains a 31-day non-PII delivery roll-up.
- When the Worker cannot be reached, production browsers stay on the local
  prediction model instead of fanning out to external RSS/status proxies.
  This keeps the site responsive on constrained networks. Email is the primary
  alert channel; Web Push is optional for browsers that support it.

## Project Structure
```
src/
├── components/ui/     # shadcn/ui components (button, card — only what's used)
│   └── AnchorNav.tsx  # Terminal-style section quick nav
├── contexts/          # I18nContext (en/zh)
├── hooks/             # Custom hooks (usePrediction)
├── lib/               # Utilities (cn, prediction model, i18n, export-share)
├── pages/             # Home (dashboard), About (/about docs page)
├── sections/          # Dashboard sections (doc-flow, no cards)
│   ├── StatusHeader.tsx      # Sticky header: LIVE status, [docs], share, refresh
│   ├── HeroSection.tsx       # Prompt + ProbabilityDisplay + meta + advice + share
│   ├── ProbabilityDisplay.tsx# Giant probability number + ASCII bar + 24h/48h toggle
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

## Code Style
- Use `@/` path alias for all imports
- shadcn/ui components in `src/components/ui/`
- Section components are self-contained dashboard modules
- Dark theme only — CSS variables in `index.css`
- Monospace font (IBM Plex Mono) for all data/numbers

## Key Patterns
- `usePrediction` renders instantly from local data, network enhances async;
  records + signals fetched in parallel, 5min auto-refresh
- Signals: `getSignalsWithFallback` is three-tier — pipeline snapshot
  (`VITE_PIPELINE_API_URL/api/signals`) → direct browser fetch → simulated.
  Worker snapshot descriptions are i18n keys (`signals.*`) rendered via `t()`.
- Simulated-fallback honesty: when network sources fail, signals must say
  "unavailable" (idle, low value) — never fabricate activity from cooldown
  arithmetic. Cooldown is the only honestly computable offline signal
  (watch units: `computeIntervalStats().medianDays` is ALREADY in days)
- Model layer emits no display copy: advice is `{ level }` → `advice.<level>`
  i18n keys; signal descriptions are i18n keys + `descriptionParams`
- Hand-rolled SVG for data visualization (Recharts removed — see Performance)
- CSS variables for theming (HSL format)
- Home holds `timeframe` state (24|48) shared by HeroSection + ProbabilityCurve
- Share: `buildShareSummary()` emits a Wordle-style terminal text (ASCII bar +
  waited/median), copied with the clean root URL — no state params in the URL
  (they were never read back; the destination always shows fresher live data)
- No localStorage-backed user features — the site is stateless for visitors
  (exception: prediction accuracy samples + locale preference)
- `public/sw.js` is hand-written **plain JS** served as-is — never add TS
  syntax (type annotations break SW registration in browsers). Icons it and
  manifest.json reference live in `public/icons/` (PIL-generated, favicon motif)
- i18n discipline: every `t('key')` must exist in BOTH en/zh dictionaries —
  audit with a key cross-reference script after touching copy (missing keys
  render as raw `[key]` on screen)

## Performance (do not regress)
- Charts are hand-rolled SVG (ProbabilityCurve) — recharts was removed from
  the bundle; do not re-add a charting library without lazy-loading it
- Supabase client is created lazily via `getSupabase()` dynamic import in
  `lib/supabase.ts` — never use a top-level `createClient`
- vite.config `manualChunks` lists ONLY eager vendors (react/ui); adding
  other deps there would force them onto the critical path
- About page is route-level code-split in App.tsx
- Fonts load non-render-blocking (preload + media=print swap in index.html)
- Below-fold Home sections use `.cv-auto` (content-visibility: auto)

## Deployment
- Cloudflare Pages: `codexresets.cc` (project `codex-resets`)
- The Pages Git build command is `pnpm --dir worker install --frozen-lockfile && pnpm run quality:cloudflare`; it is the only CI quality gate. Do not reintroduce a duplicate GitHub Actions workflow without an explicit branch-protection requirement.
- Cloudflare Worker: `codex-resets-pipeline` builds production from `NicholasHan1226/CodexResets` branch `main`, root `/worker`, with `pnpm install --frozen-lockfile && pnpm exec tsc --noEmit`, then `pnpm exec wrangler deploy`. Runtime secrets remain dashboard-managed.
- Deploy: `CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx wrangler pages deploy dist --project-name=codex-resets --commit-dirty=true`
- Supabase: email subscriptions (`subscriptions` table) + reset records
