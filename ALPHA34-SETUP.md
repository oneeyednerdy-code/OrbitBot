# Orbit alpha.34 setup additions

Run the full D1 migration chain, including `0029_social_auth_verbose_errors.sql`, before deploying the Worker.

## Required for all social account connections
Set `SOCIAL_CREDENTIAL_KEY` to a strong secret. Existing Twitch/YouTube connection encryption uses the same key.

## Threads OAuth
Set these Worker secrets:
- `THREADS_CLIENT_ID`
- `THREADS_CLIENT_SECRET`

Register this OAuth redirect URI in the Meta/Threads app:
`https://YOUR-ORBIT-HOST/connections/threads/callback`

Orbit requests `threads_basic` and `threads_content_publish`.

## Mastodon OAuth
No global Mastodon client ID is required. The administrator enters their instance domain in Orbit. Orbit registers an OAuth application with that instance and uses:
`https://YOUR-ORBIT-HOST/connections/mastodon/callback`

## Bluesky
Bluesky connection uses a revocable app password. Users should create an app password in Bluesky and enter the handle + app password in Orbit. Orbit validates it against Bluesky before encrypted storage. Never use the main Bluesky account password.

## Discord Scheduled Events
Orbit's install permission set already includes Discord's Create Events permission. Existing installs that predate that permission may need to re-authorize/reinstall Orbit so Discord grants the current permission set.
