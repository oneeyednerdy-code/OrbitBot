# Orbit v0.1.0-alpha.38 — Scheduler Preview Fidelity

Alpha.38 fixes the mismatch between the Scheduled Posts editor and its Discord preview.

## Changes

- Entered line breaks and blank lines now remain visible in the preview.
- Long lines wrap without collapsing the message into one paragraph.
- Preview text is assigned through `textContent`, keeping user-entered content inert and safe.
- The live character counter includes the selected role mention in Discord's 2,000-character message budget.
- Selecting a role dynamically adjusts the remaining message length.
- Oversized scheduled posts are rejected by the API and marked failed at dispatch instead of being silently truncated.

No migration, secret, OAuth scope, or Discord permission is added.
