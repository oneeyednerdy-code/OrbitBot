# Orbit v0.1.0-alpha.47 — Owner-Only Channel Manager

Alpha.47 adds a guarded Channel Manager for Discord server owners.

## Included

- Owner-only dashboard navigation and server-side authorization.
- Full category, text, announcement, voice, stage, forum and media channel inventory.
- Multi-select delete preview with an optional category cascade.
- Explicit warning that Discord channel deletion permanently removes messages, threads, attachments and webhooks.
- Dependency protection for Orbit settings, panels, active tickets, queued posts, alerts, applications, automations, protection scopes and Discord system/community channels.
- Exact typed confirmations, required deletion reasons, stale-preview fingerprints and Discord audit-log reasons.
- Queue-backed create/delete/restore operations with per-item status and sanitized errors.
- Bulk creation of categories, text channels and voice channels.
- Automatic pre-operation snapshots plus retained manual named backups.
- Restore previews that recreate missing channel structure and re-parent surviving channels when a category is restored.
- Diagnostics check for the bot's Manage Channels permission.

## Restore boundary

Backups contain channel/category structure, selected settings and permission overwrites. Discord assigns new IDs to recreated channels. Orbit cannot restore deleted messages, threads, attachments, webhooks or original channel IDs. Modules that referenced a deleted channel must be reconfigured to the replacement ID.

## Deployment

Run `npm run db:remote` before deployment to apply `0035_channel_manager.sql`. No new secret, OAuth scope, bot permission, Durable Object, or Queue binding is required; the existing bot install already requests Manage Channels and the existing `JOBS` queue performs the operations.
