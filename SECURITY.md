# Security policy

## Reporting a vulnerability

Please do not disclose potential security vulnerabilities in a public issue,
discussion, pull request, or commit.

Use [GitHub private vulnerability reporting](https://github.com/NicholasHan1226/CodexResets/security/advisories/new)
for this repository. Include a concise reproduction path, affected surface, and
the smallest safe proof of impact. Remove API keys, tokens, email addresses,
browser Push endpoints, and private logs before submitting.

Reports involving the Cloudflare Worker, subscription delivery, webhook
verification, database access controls, or the public API are all in scope.
We will assess a report privately, coordinate a fix, and publish an advisory
only after remediation when disclosure is appropriate.

## Supported version

Security fixes are applied to the current `main` deployment. The public
dashboard and Worker are released from that branch through Cloudflare.
