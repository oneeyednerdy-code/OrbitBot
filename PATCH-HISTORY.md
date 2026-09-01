
## 0.1.0-alpha.36 — Gateway Storm Protection
- Fixed runaway Discord Gateway reconnect/IDENTIFY behavior that could trigger Discord bot-token resets.
- Added RESUME, heartbeat ACK tracking, terminal-close halting, exponential backoff, `/gateway/bot` preflight, and IDENTIFY-budget protection.
- Added Gateway runtime and session-start budget diagnostics.

# Orbit Patch History

- **Patch 0 / alpha.8** — UI System + Foundation
- **alpha.9** — Diagnostics + Logs
- **alpha.10** — Moderation + Honeypot + Gateway
- **alpha.11** — Role Panels
- **alpha.12** — Tickets
- **alpha.13** — Scheduled Posts / Queue
- **alpha.14** — Leveling
- **alpha.15** — Automation Engine
- **alpha.16** — Community Utilities
- **alpha.17** — Ko-fi Milestones
- **alpha.18** — Creator Notifications
- **alpha.19** — Social Publishing Foundation
- **alpha.20** — Bluesky / Mastodon / Threads
- **alpha.21** — Security Center + Incident Lockdown
- **alpha.22** — Shield Mode + automatic raid/spam signals
- **alpha.23** — Community Alerts with custom live/offline messaging
- **alpha.24** — Creator Directory
- **alpha.25** — Community Events foundation
- **alpha.26** — Discord Scheduled Event creation
- **alpha.27** — Applications & Appeals workflow
- **alpha.28** — Community Health
- **alpha.29** — Creator Safety Mode
- **alpha.30** — Community Operations Center + unified cumulative release

- **alpha.31** — Adaptive Onboarding + Connection Center + persistent Diagnostics Drawer + privacy-safe Developer Bug Reporting
- **alpha.32** — UI layout patch: 7/5 desktop grid spans, Shield Mode form/select styling, independently scrollable left navigation
- **alpha.33** — Bugfix/forms pass: editable Ko-fi milestones, unified dashboard input/select/textarea styling, Shield Mode async render guard, Logs audit schema fix
- **alpha.34** — Social authorization + reliability pass: Threads OAuth, Mastodon OAuth, Bluesky app-password auth, verbose sanitized error logging, Discord Events error visibility/Create Events diagnostic, non-destructive role-panel deletion, editable Applications/Appeals with up to 10 questions, onboarding Discord-type prompt removed
- **alpha.35** — Guild authorization recovery: owner-safe access, Discord OAuth reauthentication flow, rate-limit distinction, and specific server-access errors instead of generic forbidden
# Orbit patch history

## 0.1.0-alpha.37 — Discord Reliability Baseline
- Added Discord REST bucket/global rate-limit handling and bounded 429 retry.
- Added a Gateway READY/RESUMED handshake watchdog.
- Added randomized invalid-session reconnect delay.
- Added stale and malformed interaction rejection.
- Added safe scheduled-role pings, delivery history, Retry, View in Discord, and duplicate-dispatch protection.
- Added native Discord event recurrence, complete scheduler role visibility, and a clearer Moderation + Honeypot navigation label.

## 0.1.0-alpha.38 — Scheduler Preview Fidelity
- Preserved line breaks, blank lines, and long-line wrapping in the Scheduled Posts preview.
- Switched preview updates to safe text rendering.
- Added a live 2,000-character counter that includes an optional role mention.
- Rejected oversized messages instead of silently truncating them at delivery.

## 0.1.0-alpha.39 — Visible Build Version
- Added the current Orbit version beneath the login-page wordmark.
- Added the current Orbit version to a persistent dashboard footer.
- Kept diagnostic downloads and bug reports aligned with the displayed build number.

## 0.1.0-alpha.40 — Diagnostics Schema Recovery
- Prevented a missing `orbit_error_log` table from crashing Diagnostics and Logs.
- Added a precise migration-0029 warning with the `npm run db:remote` recovery command.
- Kept core audit events available while verbose error history is awaiting migration.
- Continued surfacing unrelated D1 failures as real server errors.
