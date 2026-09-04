# Orbit v0.1.0-alpha.52 — Discord Audit Feed

Alpha.52 is a cumulative logging release built on alpha.51.

## Discord Audit Feed

- Adds an opt-in **Discord Audit Feed** to the Orbit Logs page.
- Administrators choose the Discord log channel and can enable or disable forwarding independently.
- Every new Orbit audit event is queued after it is stored successfully.
- **Send Test Log** verifies the configured channel and delivery path.
- Discord receives a compact summary with event, timestamp, actor, affected member, and a bounded allowlist of safe metadata.
- Message contents, credentials, cookies, tokens, authorization data, and raw diagnostic payloads are never copied into Discord.
- Audit entries render member references without pinging them.

## Delivery safety

- Delivery runs through the existing Cloudflare Queue, so a slow or unavailable Discord API does not break the action being logged.
- Per-event delivery state and a two-minute lease prevent duplicate sends during retries.
- HTTP 429 and server failures retry; permanent access/permission failures stop retrying and create a sanitized Orbit error entry.
- Servers that leave the feed disabled do not enqueue audit-delivery jobs.

## Migration

Apply `0037_discord_audit_feed.sql` before deploying alpha.52.

No new secret, OAuth scope, Discord permission, Queue binding, Durable Object, or token reset is required. Orbit must already have **View Channel** and **Send Messages** in the selected log channel.
