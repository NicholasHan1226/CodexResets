# Formal release readiness

`codexresets.cc` is already a production deployment. This checklist defines
when it can be described as a formally validated public release.

## Required evidence

1. Cloudflare Pages and Worker builds for the exact main commit succeed.
2. `GET /api/health` and `GET /api/signals` are healthy after that deployment.
3. The protected `/api/health/details` reports
   `forecastCalibration.decisionAccuracy48h.status === "passed"`.
4. That accuracy gate has at least 20 resolved high-confidence 48-hour
   decisions and at least five positive predictions. Both decision accuracy and
   positive-prediction precision must be at least 80%.
5. Email confirmation, Resend suppression, browser Push test/pruning, and X
   webhook-to-pipeline telemetry remain available in protected diagnostics.
6. The authenticated X API is configured, the verified-history Supabase
   migration is applied, and the deprecated `codex-resets-email` Worker has no
   active Cloudflare deployment or route.

The codebase also runs a leakage-free historical regression for the same 80%
criterion: every cutoff chooses its model using only then-known records. It is
a regression guard for future code changes, not evidence that the production
gate has already passed.

## Why the accuracy gate is strict

The target is not the raw percentage of all 48-hour windows. Most windows may
have no reset, so an always-negative classifier could appear accurate while
being useless. Only high-confidence calls (>=80% reset or <=20% no reset) are
scored; positive precision is a separate hard requirement.

## Current status

The Worker has started recording the required non-PII forecasts. It must first
collect enough real, future-resolved outcomes before this document's accuracy
condition can be asserted. No historical or synthetic backfill may be used to
claim this gate passed.
