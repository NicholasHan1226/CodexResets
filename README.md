# Codex Resets

`codexresets.cc` is a public dashboard that estimates when OpenAI Codex usage
limits may reset. It combines a browser UI with a scheduled Cloudflare Worker
that collects signals and produces a KV-backed snapshot.

## Production surfaces

| Surface | Purpose |
| --- | --- |
| `https://codexresets.cc` | The only public product domain. |
| `https://api.codexresets.cc` | Worker API for signal snapshots and operational health. |
| `codex-resets.pages.dev` | Cloudflare Pages technical hostname; do not promote it as a product URL. |

The Worker runs every 30 minutes. Its public read endpoints are:

- `GET /api/signals` — latest four-signal browser snapshot.
- `GET /api/health` — latest run result and configured capability booleans.

## Local development

```bash
pnpm install
pnpm run dev
pnpm run lint
pnpm test
pnpm run build
```

`pnpm run build` includes a production-bundle check. It fails when the public
Worker API, Supabase endpoint, or VAPID public key were not embedded in the
bundle, preventing a release that silently falls back to browser-only data.

## Public browser configuration

`.env.production` is committed intentionally. Its `VITE_*` values are public
and become part of the downloaded browser bundle:

- `VITE_PIPELINE_API_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_VAPID_PUBLIC_KEY`

Never put a service-role key, `CRON_SECRET`, VAPID private key, Resend API key,
or any other secret in an `VITE_*` variable or this file.

## Delivery

### Quality CI

`.github/workflows/ci.yml` runs on pull requests and changes to `main`:

1. frontend lint, unit tests, and production build;
2. Worker TypeScript check; and
3. Worker `wrangler deploy --dry-run` bundle validation.

### Cloudflare Pages

The Pages project is `codex-resets`. Its intended Git integration is
`NicholasHan1226/CodexResets`, production branch `main`, build command
`pnpm run lint && pnpm test && pnpm run build`, and output directory `dist`.
That makes Cloudflare build a preview for pull requests and publish production
after a successful build of `main`.

Until Git integration is active, deploy a validated `dist/` through the Pages
dashboard or with an authorized Wrangler session:

```bash
npx wrangler pages deploy dist --project-name=codex-resets
```

### Cloudflare Worker

The Worker source is in `worker/`. It uses `nodejs_compat` because the Web Push
library imports `node:crypto`.

```bash
pnpm --dir worker exec tsc --noEmit
pnpm --dir worker exec wrangler deploy --dry-run
pnpm --dir worker exec wrangler deploy
```

Use the existing `codex-resets-pipeline` Worker and `api.codexresets.cc`
custom domain. Worker secrets stay in Cloudflare; they are never committed.

## Release checks and rollback

After a Pages or Worker release, verify:

```bash
curl --fail-with-body https://api.codexresets.cc/api/health
curl --fail-with-body https://api.codexresets.cc/api/signals
```

For Pages, confirm that the deployed JavaScript references
`https://api.codexresets.cc` and that the UI reflects the latest snapshot. If
a release regresses, use the prior successful Cloudflare Pages deployment;
for the Worker, roll traffic back to the prior Worker version in the
Cloudflare dashboard.
