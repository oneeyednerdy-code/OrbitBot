# Orbit v0.1.0-alpha.51 — Reward + Panel Editing and Welcome Reliability

Alpha.51 is a cumulative feature and reliability release built on alpha.50.

## Leveling role rewards

- Current role rewards now appear beside the Leveling settings and leaderboard.
- Each reward can be loaded into the form, edited, and saved in place.
- XP settings and role-reward changes are separate operations so saving one cannot accidentally duplicate the other.
- Reward mutations validate positive levels, assignable Discord roles, duplicate level/role pairs, guild ownership, and create an audit event.

## Role Panel editing

- Existing Role Panels now have an **Edit** action.
- Administrators can change the panel name, message, button/dropdown type, and up to ten role options.
- Saving edits updates the original Discord message and the existing Orbit panel rather than creating a duplicate.
- If the original Discord message was deleted, Orbit posts a replacement in the same channel and repairs the saved message ID.
- The destination channel remains fixed during editing to avoid unsafe cross-channel partial moves.
- Roles already assigned to members are never changed by panel edits or deletion.

## Welcome reliability

- Community settings now include **Send Test Welcome** for immediate verification.
- Welcome messages explicitly allow only the joining member mention; broad mention parsing stays disabled.
- Discord failures for welcome messages, goodbye messages, and welcome auto-roles are written to the sanitized error log.
- A Shield join-processing failure can no longer prevent the Community welcome handler from running.
- Community actions show immediate progress and actionable Discord errors.

## Diagnostics navigation

- Adds a dedicated Diagnostics link under System while retaining the persistent Diagnostics drawer.

No new D1 migration, secret, OAuth scope, Discord permission, Queue binding, Durable Object, or token reset is required. Welcome events continue to require the existing **Server Members Intent**.
