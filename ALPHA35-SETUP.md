# Orbit alpha.35 setup

Alpha.35 is a cumulative replacement for alpha.34 and adds guild-authorization recovery.

1. Keep the existing D1 database and Cloudflare bindings.
2. No new migration is required beyond alpha.34 migration `0029_social_auth_verbose_errors.sql`.
3. Deploy normally with `npm install`, `npm run typecheck`, then `npm run deploy`.
4. If Orbit shows **Reconnect Discord**, use that button to refresh the dashboard OAuth session. This does not reinstall the bot or alter server roles/configuration.
5. If Orbit reports **missing Manage Server permission**, verify the connected Discord account owns the server or has Discord's Manage Server permission.
6. If Orbit reports a Discord rate limit, retry after the displayed interval rather than reinstalling the bot.

For Threads/Mastodon/Bluesky configuration introduced in alpha.34, also read `ALPHA34-SETUP.md`.
