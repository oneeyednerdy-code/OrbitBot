# Orbit v0.1.0-alpha.64 — My Stream Save Fix

Alpha.64 fixes the owner-only Twitch My Stream save failure reported by production diagnostics.

## Fixed

- Owner-stream configuration now initializes `last_live_state` to `0` instead of inserting `NULL` into the required D1 column.
- Added a regression test covering the owner-stream insert values.

## Deployment

No new migration is required. Deploy the Worker source so the corrected `saveOwnerStream` query is active.
