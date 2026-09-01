# Orbit v0.1.0-alpha.35 — Guild Authorization Recovery

- Fixed the dashboard collapsing Discord OAuth failures and API rate limits into a misleading generic `forbidden` server error.
- Server owners are now accepted explicitly even if Discord returns an unusual permissions representation.
- Added distinct responses for expired/revoked Discord authorization, Discord rate limiting, upstream authorization failures, missing server access, and missing Manage Server permission.
- Added a Reconnect Discord recovery screen for stale OAuth sessions.
- Added a Discord rate-limit screen that preserves server access instead of reporting a permission failure.
- The server picker and per-server authorization now use the same owner-or-Manage-Server rule.
- No D1 migration, Discord bot permission, OAuth scope, or new secret is required.
