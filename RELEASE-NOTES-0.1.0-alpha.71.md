# Orbit v0.1.0-alpha.71 — Counting Module

Alpha.71 adds a configurable Discord counting game to Orbit.

## Added

- New **Counting** dashboard module with explicit on/off control and a selected Discord text channel.
- Starting-number, alternating-user, numbers-only, reset-on-mistake, and invalid-message deletion parameters.
- Correct and wrong reactions plus editable wrong-number and same-user messages.
- Placeholder support for `{user}`, `{expected}`, `{received}`, and `{count}`.
- Gateway-backed sequence validation with atomic D1 updates, activity history, correct-count and mistake statistics, and highest-count tracking.
- Dashboard controls for Start / Continue, Turn Off, and Reset Count.
- Migration `0049_counting.sql`.

## Deployment

Apply the cumulative source and the pending D1 migrations. The counting module requires Orbit’s existing Discord Gateway, Message Content Intent, and permission to read/send messages and add reactions in the selected channel. No new secret or OAuth scope is required.
