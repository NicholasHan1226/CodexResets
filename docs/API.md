# Codex Resets API

Base URL: `https://codexresets.cc`

Public read endpoints are CORS-enabled. Operational and delivery routes are
either capability-protected or provider-signed; callers must not treat this API
as a general data-ingestion or notification interface.

## Public reads

- `GET /api/signals` — latest Worker-produced signal snapshot for the browser.
- `GET /api/health` — safe operational status, capability booleans, and compact
  delivery totals. It deliberately excludes raw errors, source URLs, and
  candidate text.

## Subscription lifecycle

- `POST /api/subscribe/email` — accepts a small JSON body with `email` and a
  Turnstile token. It is IP-rate-limited and starts double opt-in only.
- `GET /api/subscribe/confirm?t=...` — consumes a short-lived confirmation
  token and activates the address.
- `GET /api/unsubscribe?e=...&x=...&t=...` — consumes an expiry-bound signed
  unsubscribe link.
- `POST /api/subscribe/push` — accepts a bounded browser Push subscription for
  a supported Web Push authority; it applies an IP quota and sends a delivery
  test without following redirects.
- `POST /api/unsubscribe/push` — removes the browser-provided endpoint.

## Provider and administrator routes

- `POST /api/webhooks/resend` — only accepts bounded, fresh, Svix-signed Resend
  events.
- `GET|POST /api/webhooks/x` — supports X CRC ownership checks and bounded,
  HMAC-signed fresh post events.
- `GET /api/health/details`, `POST /api/run`, and `POST /api/test-email` require
  `Authorization: Bearer $CRON_SECRET` and are not public integration endpoints.

## Data boundary

The browser uses the Supabase publishable key only for confirmed reset history.
Subscriptions, Push endpoints, pending lifecycle rows, email delivery, and all
write operations are Worker service-role operations.
