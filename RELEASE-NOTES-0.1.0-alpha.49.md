# Orbit v0.1.0-alpha.49 — Security & Reliability Hardening

Alpha.49 is a cumulative security and reliability release built on alpha.48.

## Security

- Fixed a guild-authorization bug in social connection OAuth.
- Validates submitted channel and role IDs against the selected Discord server before high-risk mutations.
- Revalidates scheduled/social Discord destinations at delivery time.
- Defaults Discord messages to no parsed mentions; only explicitly selected role/user IDs can ping.
- Requires public HTTPS destinations for Mastodon instances and RSS feeds.
- Redacts bearer tokens, credential query parameters, and secret JSON values from verbose error details.

## Reliability

- Adds expiring leases and attempt counters for scheduled posts, social posts, and Channel Manager work.
- Uses deterministic Discord nonces for retry protection where supported.
- Stops uncertain Channel Manager creates for owner review instead of blindly duplicating them.
- Records per-channel Shield, Lockdown, and Creator Safety failures and retains failed snapshots for retry.
- Refreshes Discord OAuth access tokens from encrypted refresh tokens for up to 30 days.
- Calculates recurring scheduled posts from their previous scheduled time in the configured timezone.
- Preserves local send time across DST and clamps monthly recurrence to shorter months.
- Makes Ko-fi total updates and XP cooldown awards concurrency-safe.
- Cancels stale page results after dashboard navigation.

## Operations

- Adds 30-day verbose error retention, 90-day saved diagnostic retention, and cleanup of expired sessions/OAuth states.
- Adds `package-lock.json`, corrects Worker TypeScript library configuration, and adds scheduler recurrence tests.
- Adds migration `0036_security_reliability_hardening.sql`.

No new secret, Discord OAuth scope, bot permission, Queue binding, or Durable Object is required.
