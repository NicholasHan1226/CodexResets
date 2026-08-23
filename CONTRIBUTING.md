# Contributing to Codex Resets

Thank you for helping make the dashboard clearer, more reliable, and easier to
share. Small, focused changes are the easiest to review and release.

## Before you start

- Search existing issues before opening a new one.
- Never include API keys, tokens, email addresses, browser Push endpoints, or
  copied production logs containing personal data in an issue, commit, or pull
  request.
- Do not present simulated, historical, or manually inserted observations as
  live reset evidence. Forecast calibration and public release readiness depend
  on real, forward-looking production observations.
- Keep the dashboard concise. Visitors should be able to see the current reset
  probability and share it without navigating operational detail.

## Local checks

```bash
pnpm install
pnpm run quality:cloudflare
```

`quality:cloudflare` is the project quality gate. It runs linting, tests,
production-build verification, and Worker validation. GitHub Actions is not
used for this repository.

## Pull requests

1. Explain the user-visible or operational outcome, not only the implementation.
2. Keep each pull request scoped to one concern.
3. Add or update tests when behavior changes.
4. When touching UI copy, update both English and Chinese translations and
   check the rendered desktop and mobile states.
5. When touching the Worker, preserve its conservative confirmation and
   correction behavior; do not bypass the single-writer coordinator or expose
   private operational data through public endpoints.
6. Update the README or a focused document when an API, deployment step, or
   long-lived contributor workflow changes.

## Reporting a bug

Use the bug-report form and include the affected page or endpoint, the time
and timezone, steps to reproduce, expected behavior, and what actually
happened. Remove personal and secret values before submitting.

For a potential security vulnerability, do not open a public issue. Use
GitHub's private vulnerability reporting for this repository when available.
