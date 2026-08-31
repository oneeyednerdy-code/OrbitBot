# Orbit v0.1.0-alpha.34 — Social Auth, Events, Forms + Verbose Diagnostics

## Added
- Threads OAuth authorization with `threads_basic` and `threads_content_publish`.
- Mastodon per-instance OAuth authorization with dynamic app registration.
- Bluesky app-password authorization with server-side validation and encrypted storage.
- Verbose sanitized browser request log plus server-side `orbit_error_log` entries and request references.
- Discord **Create Events** permission diagnostic.
- Applications/Appeals question builder with Add/Remove controls and a hard limit of 10 questions.
- Edit existing Applications/Appeals forms in place.

## Fixed
- Discord Scheduled Events now surface the real Discord error message/code instead of failing silently.
- Discord Scheduled Event create/delete failures receive a diagnostic request reference.
- Deleting a role panel removes the Discord panel message first while intentionally preserving every role already assigned to members.
- Social Publishing now uses authorized account connections rather than raw credential JSON in the dashboard.

## Changed
- Removed the onboarding prompt asking what kind of Discord server is being configured.
- Existing stored community type values remain compatible but are no longer requested in onboarding.

## Database
- Adds migration `0029_social_auth_verbose_errors.sql`.
- Adds encrypted OAuth context support to `connection_oauth_states`.
- Adds `orbit_error_log` for sanitized server failures.
