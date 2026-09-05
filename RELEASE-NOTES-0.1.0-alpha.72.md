# Orbit v0.1.0-alpha.72 — Birthday Module

- Added private month/day birthday registration and removal controls.
- Added configurable annual Discord announcement channel, timezone, message template, and optional role ping.
- Added opt-out support and once-per-year duplicate protection with retry-safe D1 claims.
- Added migration `0050_birthdays.sql`.

Birthdays require the existing Discord Gateway/cron runtime and the bot’s normal channel send permission. Orbit does not collect birth years.
