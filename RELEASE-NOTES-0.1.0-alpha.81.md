# Orbit v0.1.0-alpha.81 — Channel Delete Access Diagnostics

Alpha.81 improves Channel Manager deletion failures.

## Fixed

- Discord `50001: Missing Access` failures now identify the affected channel.
- The error explains that Orbit needs View Channel and Manage Channels access in the channel or its category.
- Discord `50013: Missing Permissions` failures now include a permission-specific repair message.
- Channel Manager records the correct Discord method for delete, edit, and create failures.

No new D1 migration is required.
