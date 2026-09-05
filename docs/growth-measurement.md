# Product measurement and search follow-up

Source: Cloudflare GraphQL `rumPageloadEventsAdaptiveGroups`, filtered to
`requestHost=codexresets.cc`. Last checked: 2026-09-05, window end
`2026-09-05T06:00:00Z` (14:00 Asia/Shanghai). This is a dated baseline, not a
live counter or proof of organic growth.

| Window ending at the timestamp above | PV | PV not flagged as bot | Visits not flagged as bot |
| --- | ---: | ---: | ---: |
| Previous 24 hours | 24 | 24 | 4 |
| Previous 7 days | 105 | 94 | 32 |

These windows had `sampleInterval=1`. The seven-day non-bot page distribution
was home 88, About 5, prediction guide 1. Referrers only contained empty values
and the site itself; no attributed search-engine visits were recorded. Empty
referrers do not prove direct entry. Internal development visits may remain.
Older queried windows were sampled and contained multiple site tags; do not
publish a precise growth percentage without checking comparable coverage.

## Reproduce and interpret

Provide Cloudflare analytics credentials via the environment, never source
files or command-line literals. Run:

```sh
REPORT_END=2026-09-05T06:00:00Z pnpm run report:traffic
```

Omit `REPORT_END` for current rolling windows. The command requires
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, prints aggregate JSON and
does not change Cloudflare, subscribe anyone, or install a tracker. An API
error or truncated result fails the report instead of printing partial totals.
Cloudflare already extrapolates sampled counts: do not multiply them again.
Record the time window, production hostname, site tags and sampling flag with
every comparison. Do not treat Visits as unique people or bot=0 as proof of a
human. Preview domains never enter this command's totals.

For future browser QA, intercept `**/beacon.min.js*` and `**/cdn-cgi/rum*`
before navigation. Test subscriptions only against intercepted local fixtures;
never submit real addresses or click live verification challenges for QA.

## Subscription value

Use existing protected `/api/health/details` telemetry for confirmation-email
sends, confirmations, deliveries, bounces, complaints, and unsubscribe events.
Check `coverage` before interpreting totals. An incomplete sample remains
useful for diagnosis but is not a full-period report. Count ratios are not a
user funnel: confirmations can occur in a different window, repeated sends
can exist, and no cross-site visitor identity is collected. Read traffic and
subscription stages side by side; do not divide mismatched windows and call
the result conversion. No new visitor tracking or public operations panel is
introduced.

## Search entry validation

On 2026-09-05 all seven sitemap URLs returned HTML successfully via curl,
contained matching canonical links, and had no HTML `noindex` directive.
The sitemap and robots file are publicly available. Paired English/Chinese
guides retain reciprocal hreflang links. This proves crawlable entry points,
not Google indexing, ranking or impressions.

Search Console opened at its signed-out introduction page in this session.
Indexing, queries, clicks, impressions and property ownership remain unverified.
After the site owner's login, use the existing property if present; inspect
the sitemap and each guide's indexed canonical, then export 28-day page/query
performance. Do not create another property or alter DNS verification without
checking the existing setup. Use those results to revise pages with actual
impressions; avoid speculative mass content generation.

## Next evidence

After release, verify the subscription layout at desktop and 320/390px widths
in both languages. Continue the existing scheduled forecast collection; leave
the formal accuracy gate unchanged. Real reset delivery requires a future
qualifying event and provider receipt, and search improvements require fresh
Search Console evidence. Neither is implied by successful deployment.

References: [Cloudflare metrics](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/),
[sampling](https://developers.cloudflare.com/analytics/graphql-api/sampling/),
[Search Console](https://developers.google.com/search/docs/monitor-debug/search-console-start).
