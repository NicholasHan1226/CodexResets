# AGENTS.md

## Project Overview
**Codex Resets** — A real-time prediction dashboard for OpenAI Codex usage limit resets. Uses a signal-based model to estimate reset timing with probability curves.

**Product focus**: visitors come to SEE the reset probability and SHARE it. No accounts, no personal usage tracking (Codex client already provides those). Anonymous-first: email/push alerts use the email/endpoint as identity.

## Tech Stack
- **Framework**: Vite 7 + React 19 + TypeScript 5
- **Styling**: Tailwind CSS 3.4 + shadcn/ui (New York style)
- **Charts**: Recharts 2
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
- `usePrediction` hook manages prediction state with 30s auto-refresh
- Prediction data is generated client-side (simulated signals)
- Recharts for data visualization with custom dark theme
- CSS variables for theming (HSL format)
- Home holds `timeframe` state (24|48) shared by HeroSection + ProbabilityCurve
- Share: `sharePredictionState()` builds URL with state params, copied via clipboard
- No localStorage-backed user features — the site is stateless for visitors
  (exception: prediction accuracy samples + locale preference)

## Deployment
- Cloudflare Pages: `codexresets.cc` (project `codex-resets`)
- Deploy: `CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx wrangler pages deploy dist --project-name=codex-resets --commit-dirty=true`
- Supabase: email subscriptions (`subscriptions` table) + reset records
