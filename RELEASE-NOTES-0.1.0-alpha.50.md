# Orbit v0.1.0-alpha.50 — Gateway Recovery + Clearer Diagnostics

Alpha.50 is a cumulative recovery and diagnostics release built on alpha.49.

## Gateway recovery

- Adds an owner-only recovery workflow for a persisted terminal Gateway halt.
- A retry requires the exact phrase `RETRY GATEWAY` and an acknowledgement that Discord's required intents were enabled and saved.
- Uses the existing guarded `force=1` Durable Object path instead of bypassing Gateway safety logic.
- Retains the five-minute force-retry cooldown, `/gateway/bot` preflight, IDENTIFY budget floor, terminal close-code handling, and reconnect backoff.
- Records each owner force-retry request in the Orbit audit log.
- Shows direct setup guidance for Server Members Intent and Message Content Intent when Discord reports `disallowed_intents`.

## Diagnostics and logs

- Core health now excludes optional social integration checks from its percentage.
- Optional integrations remain visible in their own section.
- Failures from the last hour appear separately from earlier retained error history.
- Diagnostic exports keep both groupings and the complete backward-compatible `recent_errors` list.

## Channel Manager

- Unknown parent categories now return a structured recovery action.
- The dashboard offers **Add missing categories to this plan** and immediately revalidates the draft.
- The correction changes only the local draft. Existing preview, exact phrase, acknowledgement, owner authorization, backup, and Queue protections still apply before Discord is changed.

No migration, token reset, new secret, OAuth scope, bot permission, Queue binding, or Durable Object is required.
