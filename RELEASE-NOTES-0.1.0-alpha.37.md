# Orbit v0.1.0-alpha.37 — Discord Reliability Baseline

Alpha.37 applies Discord's current production guidance beyond the alpha.36 Gateway-storm repair.

## Changes

- Shared Discord REST client now reads rate-limit headers instead of hard-coding quotas.
- Per-route and global 429 backpressure is tracked in the Worker isolate.
- A Discord 429 is retried once only when its wait is ten seconds or less; longer waits are returned to the queue/caller for rescheduling.
- Successful responses with an exhausted bucket prevent the next request from immediately hitting the same limit.
- Gateway connections must complete READY or RESUMED within 30 seconds or reconnect through the existing safe backoff path.
- Invalid Gateway sessions wait a randomized one-to-five seconds before reconnecting.
- Interaction webhooks reject stale requests older than five minutes and malformed JSON after Ed25519 verification.
- Scheduled Posts can optionally ping one Discord role selected from roles marked mentionable.
- Role mentions use an explicit `allowed_mentions.roles` allowlist; `@everyone`, `@here`, managed roles, and arbitrary role IDs are never enabled.
- The selected role is validated at scheduling time and immediately before delivery.
- Scheduled delivery now exposes Scheduled, Sending, Posted, Failed, Paused, next-run, and last-posted states.
- Successful deliveries include a View in Discord link; failures include their delivery error and a Retry action.
- Dispatch uses an atomic Sending claim to prevent duplicate deliveries when cron and Send Now overlap.

## Existing safeguards retained

- One named Durable Object owns the Gateway connection.
- RESUME is preferred whenever a resumable session exists.
- Terminal close codes halt instead of reconnecting.
- `/gateway/bot` is checked before every fresh IDENTIFY.
- The last five session starts are protected.
- Heartbeat ACKs detect zombie connections.
- Privileged intents are limited to the features Orbit currently implements.
- Install permissions remain granular; Administrator is not requested.
- Interaction signatures, OAuth state, CSRF, secure cookies, Turnstile, role hierarchy, and secret redaction remain enforced.

Migration `0030_scheduler_role_delivery.sql` adds the pinged role to delivery history and an index for recent runs. No new secret, OAuth scope, or Discord permission is required.
