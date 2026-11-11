# Security policy

「不怕吃灰」收藏夹 is designed for one user on one computer. Run it only on loopback (`127.0.0.1`). The repository does not provide public-host authentication, multi-tenant isolation, or authorization suitable for an internet deployment.

## Report a vulnerability

Use the repository host's private security-reporting feature when available. Do not include API keys, Webhook URLs, pairing tokens, cookies, browser profiles, collection exports, or local databases in a public issue.

If a credential was exposed, revoke or rotate it at the provider first. Removing it from a later commit or release archive does not invalidate the original credential.

## Secrets and personal data

- Keep optional credentials in an ignored `.dev.vars` or the external runtime secret file documented in the README.
- Local D1 state, JSON backups, logs, screenshots, browser artifacts, and extension pairing tokens are private user data and must not be attached to releases.
- DeepSeek and Feishu integrations are optional and disabled when their environment variables are empty.
