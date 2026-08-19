# AGENTS.md

## Project Overview
**Codex Resets** — A real-time prediction dashboard for OpenAI Codex usage limit resets. Uses a signal-based model to estimate reset timing with probability curves and countdown timers.

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
├── hooks/             # Custom hooks (usePrediction)
├── lib/               # Utilities (cn, prediction model)
├── pages/             # Page components (Home)
├── sections/          # Dashboard sections
│   ├── StatusHeader.tsx      # Live status + model info
│   ├── CountdownPanel.tsx    # Reset countdown timer
│   ├── ProbabilityGauges.tsx # 24h/48h circular gauges
│   ├── ProbabilityCurve.tsx  # 7-day area chart
│   ├── SignalPanel.tsx       # Signal monitor bars
│   ├── HistoryPanel.tsx      # Historical reset data
│   └── ModelInfo.tsx         # About the model
├── types/             # TypeScript type definitions
├── App.tsx            # Root router
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
