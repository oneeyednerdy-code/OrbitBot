# Orbit v0.1.0-alpha.70 — Scheduled Events Permission Repair

Alpha.70 fixes the Discord Scheduled Events permission path.

## Fixed

- The Discord install permission mask is now assembled from named permission bits and explicitly includes `Create Events`.
- Orbit preflights the bot’s effective guild permissions before attempting to create a native Discord Scheduled Event.
- The Events page reports the missing permission clearly instead of showing only a generic Discord failure.
- Existing installations receive a direct **Reauthorize Orbit** link that requests the current permission set.
- Scheduled Events permission behavior is covered by a regression test.

## Important

The code cannot add a Discord permission to an already-installed bot role automatically. If Orbit was installed before the Create Events grant, click **Reauthorize Orbit**, approve the updated permissions in Discord, and then retry the event.

No new D1 migration is required.
