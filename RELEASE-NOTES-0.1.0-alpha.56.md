# Orbit v0.1.0-alpha.56 — Reliability Control Plane

Alpha.56 turns the separate module safeguards into a shared creator/admin control plane.

## Operations and reliability

- Added Permission Doctor with Discord permission-bit calculation, channel permission-overwrite evaluation, Administrator handling, and bot role hierarchy checks.
- Added a Reliability scan to the Operations Center covering Discord resources, queue/Gateway bindings, required D1 tables, missing configured channels/roles, recent errors, and rate-limit buckets.
- Added Action Center history for queued Channel Manager operations, including progress, partial failures, request references, and terminal state.
- Added persisted rate-limit bucket observations alongside the existing bounded wait and one-retry behavior.
- Added Gateway intent manifest, heartbeat timestamps, missed-heartbeat count, and supervised runtime status.
- Added named Orbit configuration backups with download, upload/restore, strict guild/version validation, secret-field redaction, and exact confirmation before replacement.

## Events

- Event creation can post a guild-scoped RSVP panel with Going, Maybe, and Can’t Go buttons.
- RSVP responses enforce signup limits, remain isolated by guild/event, and show Going / Maybe counts in the Events page.
- Removing an event cleans up its RSVP panel when Discord still has the message.

## Deployment

- Apply the cumulative D1 migration chain through `0040_config_backups.sql`.
- No new secret or OAuth scope is required.
- Existing Discord privileged intents and granular Orbit permissions remain in use; Orbit still does not request Administrator.
