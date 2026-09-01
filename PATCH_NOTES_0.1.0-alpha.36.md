# Orbit v0.1.0-alpha.36 — Gateway Storm Protection

## Critical fix
- Replaced the Discord Gateway reconnect implementation that could consume Discord's daily IDENTIFY budget and trigger an automatic bot-token reset.

## Gateway lifecycle
- Added `/gateway/bot` preflight before every fresh IDENTIFY.
- Added Gateway RESUME using cached `session_id`, `resume_gateway_url`, and sequence number.
- Added heartbeat ACK tracking and zombie-connection recovery.
- Added jittered first heartbeat.
- Removed duplicate reconnect scheduling from WebSocket `error` + `close`.
- Added exponential reconnect backoff.
- Added terminal-close handling for 4004, 4010, 4011, 4012, 4013, and 4014.
- Added session-start budget protection at 5 remaining IDENTIFY attempts.
- Persisted safe Gateway state in Durable Object storage.
- Token changes and Gateway implementation upgrades safely clear stale terminal-halt state.

## Diagnostics
- Added Gateway runtime status.
- Added Discord session-start/IDENTIFY budget reporting.
- Gateway halt/backoff states now explain why Orbit is intentionally not reconnecting.

## Recovery
- Added `ALPHA36-RECOVERY.md` with the safe order for deploying the patch and replacing a Discord-reset bot token.

No D1 migration is required for alpha.36.
