# Orbit v0.1.0-alpha.35 — Guild Authorization Recovery

## Fixed
- The dashboard no longer reports every Discord guild-authorization failure as generic `forbidden`.
- Discord OAuth expiry/revocation now returns `discord_reauth_required` with a Reconnect Discord action.
- Discord API rate limiting now returns `discord_rate_limited` with retry guidance instead of pretending server permissions were lost.
- Server ownership is accepted explicitly in both the server picker and per-server authorization gate.
- Actual missing Manage Server permission now returns `missing_manage_server_permission`.
- A server that is no longer present for the connected account returns `guild_not_available`.
- Other Discord authorization API failures return `discord_authorization_failed` with the upstream HTTP status in sanitized detail.

## Deployment
- No D1 migration.
- No new secret.
- No new Discord bot permission.
- No OAuth scope change.
- Existing alpha.34 social authorization, Events, forms, role-panel deletion and verbose diagnostics remain included.
