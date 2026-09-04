# Orbit v0.1.0-alpha.55 — Selectable Sample Banks

Alpha.55 makes the Community Engagement sample banks available directly inside Orbit.

## Community Engagement

- Added a dashboard dropdown for bundled sample banks.
- Administrators can load Gamer, Pop Culture, Nerd, Twitch Streamer, Tabletop RPG, Sci-Fi/Fantasy, Horror, or Anime/Comics questions with one click.
- Sample banks are loaded server-side from bundled plain-text assets and become the active bank immediately.
- Previously posted question history remains intact when switching between sample and custom banks.
- Custom `.txt` uploads remain supported.

## Deployment

- No new migration is required beyond `0038_community_engagement.sql` from alpha.54.
- No new secret, OAuth scope, privileged intent, Discord permission, Queue binding, or Durable Object is required.
