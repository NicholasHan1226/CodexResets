# Bundled history audit — 2026-08-30

Scope: the eight static rows previously in `src/lib/reset-data.ts`. These are
not production database rows. All eight are excluded from the model and public
history pending direct completion-and-time verification; no database records
were deleted and no backdated alerts were sent.

The seed labelled every row verified, but included forward-looking descriptions
and provided no support for the exact event timestamps. A post URL alone does
not prove completion or the time an account received usage. Public X pages were
not readable in this audit, so unresolved rows are quarantined, not called fake
or silently retimed. The current verified production history remains in use.

| Post ID (official author @thsottiaux) | Old asserted time UTC | Old description | Audit disposition |
| --- | --- | --- | --- |
| [2088763063495450791](https://x.com/thsottiaux/status/2088763063495450791) | 2026-08-15 18:00 | Usage included in subscription is fantastic | Completion/time unverified |
| [2087706104814023111](https://x.com/thsottiaux/status/2087706104814023111) | 2026-08-13 17:01 | Crossed 15M users, enjoy a nice reset | Exact time unverified |
| [2087423996115681767](https://x.com/thsottiaux/status/2087423996115681767) | 2026-08-12 16:00 | Little surprise tomorrow — 15M users milestone | Preview, not a completion assertion |
| [2086972933566857393](https://x.com/thsottiaux/status/2086972933566857393) | 2026-08-11 17:00 | Usage limits reset for all paid users | Exact time unverified |
| [2086972802457063486](https://x.com/thsottiaux/status/2086972802457063486) | 2026-08-11 09:01 | Reset completed as promised | Exact time/context unverified |
| [2086189414292865249](https://x.com/thsottiaux/status/2086189414292865249) | 2026-08-08 18:00 | Performative reset on Monday | Preview, not a completion assertion |
| [2086188036493344823](https://x.com/thsottiaux/status/2086188036493344823) | 2026-08-08 17:00 | GPT-5.6 Sol celebration reset | Completion/time unverified |
| [2083395449814229287](https://x.com/thsottiaux/status/2083395449814229287) | 2026-08-01 18:00 | Week of efficiency celebration | Completion/time unverified |

Do not restore rows just to increase the model sample count. A future recovery
must use direct, complete official evidence and retain publication/discovery
provenance; publication time is an observation, not exact execution time. Use
the existing non-delivery backfill lifecycle. Past predictions must never be
rewritten as successful predictions after discovering outcomes.

Verification: `pnpm run quality:cloudflare`, production `/api/signals` readback,
and browser 24/48-hour rendering. Regression tests enforce an empty bundled
seed, versioned future-only calibration and fixed UTC timing boundaries.
