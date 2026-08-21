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
npx tsc -b --noEmit  # TypeScript check
```

## Backend Pipeline (worker/)
`codex-resets-pipeline` — Cloudflare Worker, cron `*/30 * * * *`, served at
`https://api.codexresets.cc` (custom domain; workers.dev is DNS-poisoned in
some regions — do not rely on it).

- `src/scrape.ts`    — tweet scraping: RSSHub instances → nitter mirrors
  (xcancel.com currently works from the edge) → Google News RSS fallback for
  reset detection. All instance errors collected into `attempted[]`.
- `src/signals.ts`   — builds the 4-signal snapshot (tibopost / status_page /
  cooldown / launch_noise), mirrors the frontend model
- `src/pipeline.ts`  — orchestration: scrape → detect → insert (service role)
  → notify → snapshot to KV (`signals:latest`) → health report
  (`health:last_run`)
- `src/notify.ts`    — Resend email (HMAC-signed unsubscribe links) +
  Web Push via @block65/webcrypto-web-push (prunes 404/410 endpoints)
- `src/routes.ts`    — GET /api/signals, GET /api/health,
  POST /api/subscribe/push, POST /api/unsubscribe/push,
  GET /api/unsubscribe (HMAC email), POST /api/run (Bearer CRON_SECRET)
- Deploy: `cd worker && CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx wrangler deploy`
- Secrets set: VAPID_PRIVATE_KEY, UNSUBSCRIBE_SECRET, CRON_SECRET
- Secrets PENDING (user): SUPABASE_SERVICE_ROLE_KEY (record inserts +
  notification fan-out), RESEND_API_KEY (email sends). Pipeline degrades
  gracefully and reports gaps in /api/health `configured`.

### Database state (Volces-hosted Supabase-compatible, PostgREST)
- `reset_records` — 47 verified rows (2026-03-18 → 2026-08-16), richer than
  the bundled static history. RLS on + policy `anon read reset_records`
  (SELECT to anon). Writes: service role only.
- `subscriptions` — RLS on + policy `anon insert subscriptions` (INSERT to
  anon, no SELECT policy) — subscribe form works, emails are NOT readable
  via anon key.
- `push_subscriptions` — created 2026-08-21, RLS on, zero policies, granted
  to service_role only. Worker upserts with `?on_conflict=endpoint`.
- WARNING: with RLS on and no policies, PostgREST SELECT returns `[]`
  silently — an "empty table" REST response does NOT prove emptiness.
  Verify via `exec_sql` before concluding anything about row counts.

## Project Structure
```
src/
├── components/ui/     # shadcn/ui components (card, badge, progress, etc.)
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
│   └── PredictionAccuracy.tsx# Model accuracy (used on About page)
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
- Hand-rolled SVG for data visualization (Recharts removed — see Performance)
- CSS variables for theming (HSL format)
- Home holds `timeframe` state (24|48) shared by HeroSection + ProbabilityCurve
- Share: `sharePredictionState()` builds URL with state params, copied via clipboard
- No localStorage-backed user features — the site is stateless for visitors
  (exception: prediction accuracy samples + locale preference)

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
- Deploy: `CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx wrangler pages deploy dist --project-name=codex-resets --commit-dirty=true`
- Supabase: email subscriptions (`subscriptions` table) + reset records
