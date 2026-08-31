# Orbit v0.1.0-alpha.31 — Adaptive Onboarding + Diagnostics Bug Reporting

## New
- Adaptive onboarding asks server managers what they actually want Orbit to do.
- The sidebar only shows enabled feature families instead of every Orbit module.
- `Add More Features` lets managers enable or hide feature families later without deleting existing configuration.
- Community-type presets are captured for future recommendation logic without forcing a preset.
- Connection Center with real Twitch and YouTube OAuth entry points when the Orbit operator has configured those developer apps.
- Connected-account credentials remain encrypted server-side and are never returned to the browser.
- Persistent, collapsed Diagnostics Drawer on every dashboard page.
- Full diagnostics, privacy-safe copy report, and downloadable diagnostic log.
- Browser JS errors and Orbit API failures are collected only in the local browser for recent troubleshooting and sanitized before submission.
- `Report a Bug` creates an `ORB-YYYY-######` reference ID.
- Server-side bug reports include optional sanitized diagnostics and never intentionally include tokens, cookies, secrets, authorization headers, or stored message content.
- Operator-only Developer Bug Inbox with report status workflow and duplicate fingerprints.

## Database
- `0027_adaptive_onboarding.sql` stores guild feature selections and creator OAuth connections.
- `0028_diagnostics_bug_reports.sql` stores bug reports and report history.

## Operator setup added
Set `ORBIT_OPERATOR_USER_IDS` in `wrangler.jsonc` to your Discord user ID (or a comma-separated list) to expose the Developer Bug Inbox only to those Discord accounts.

For easy Twitch/YouTube connection buttons, configure the platform OAuth secrets documented in `ALPHA31-SETUP.md`.
