# Orbit v0.1.0-alpha.82 — Scoped Channel Deletion

Alpha.82 reduces Channel Manager’s dependence on broad channel visibility.

## Added

- Hidden-channel deletion by ID when the channel was captured in a guild-scoped Orbit backup.
- Manual IDs are validated against the selected guild’s visible inventory or recent Orbit snapshots.
- Delete snapshots preserve known hidden targets before the queued operation runs.
- Delete errors now explain that guild-level Manage Channels is the relevant Discord requirement.
- Arbitrary unverified channel IDs are rejected to prevent cross-server deletion mistakes.

No new D1 migration is required.
