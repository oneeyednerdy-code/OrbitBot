# Orbit v0.1.0-alpha.53 — Reliability Foundation

Alpha.53 is a cumulative reliability release built on alpha.52.

## Runtime safety

- Message automations ignore bot and webhook messages, preventing Orbit posts from recursively triggering Orbit.
- Unknown automation conditions fail closed, unsupported actions are rejected, and Discord non-success responses make an automation run partial instead of successful.
- Discord, OAuth, Turnstile, Twitch, YouTube, Bluesky, Mastodon, Threads, RSS, and interaction-webhook requests now use bounded timeouts.
- Queue retries use exponential backoff and stop after five attempts. Exhausted work receives a terminal database status and a sanitized error-log reference.
- The Discord Audit Feed now behaves as a database outbox: failed or missed enqueues are recovered by the scheduled sweep.
- Scheduled and social publishing use bounded dispatch attempts. Recurring scheduled posts reset their attempt counter after a successful delivery.

## Data consistency

- Role Panel lists now load with two batched queries instead of one query per panel.
- Role Panel items are inserted with `D1.batch()`.
- If Discord accepts a Role Panel edit but D1 rejects the update, Orbit attempts to restore the previous Discord panel or remove a newly-created replacement.
- Select-menu role updates report partial failures instead of claiming every role changed successfully.
- Leveling grants only newly-reached rewards, honors `remove_previous`, and records role or announcement failures.

## Dashboard lifecycle

- Each page render owns a cancellable request scope.
- Navigating to a different page or server aborts the old request immediately.
- Aborted page requests are treated as stale navigation, not as network failures in downloaded diagnostics.

## Build quality

- Added behavioral tests for automation loop protection, fail-closed conditions, bounded queue retries, and browser navigation cancellation.
- Added a browser JavaScript syntax checker and a single `npm run check` command.
- Centralized the runtime version used by bug reports, diagnostic downloads, the login page, and the dashboard footer.

No new D1 migration, secret, OAuth scope, Discord permission, Queue binding, Durable Object, or token reset is required. Keep all 37 existing migrations applied through `0037_discord_audit_feed.sql`.
