
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

## 0.1.0-alpha.41 — Page Transition Guard + Verification Panel
- Prevented late Community responses from replacing XP Leveling after navigation.
- Added page-ownership guards to Community and Leveling loads, saves, refreshes, and error rendering.
- Added a dashboard action that posts a **Verify with Orbit** button in a selected Discord channel.
- Button clicks create private, one-use verification links bound to the clicking Discord member and expiring after 15 minutes.
- Added server-side guild/channel validation and actionable Discord posting errors.

## 0.1.0-alpha.42 — Role-Gated Community Alerts
- Added a guild-level automation that announces approved Creator Directory members when Twitch or YouTube changes from offline to live.
- Added an eligibility-role check, destination-channel selector, optional mentionable ping role, polling interval, and editable live-message template.
- Added per-creator/platform delivery state to prevent duplicate announcements during the same live session.
- Uses direct member lookups for listed creators instead of enumerating the Discord member list.
- Preserved existing individually configured Twitch, YouTube, and RSS alerts.

## 0.1.0-alpha.43 — Tickets Page Guard
- Prevented a late Tickets API response from replacing the active page after navigation.
- Guarded category and ticket-panel refreshes against guild/page changes.
- Prevented stale Tickets failures from replacing the active page with an error screen.
- No migration, secret, OAuth scope, or Discord permission changes.

## 0.1.0-alpha.44 — Common Role Panel Templates
- Added Pronouns, Notification Pings, Interests, and Regions quick templates.
- Pronouns include He/Him, She/Her, They/Them, He/They, She/They, It/Its, Neopronouns, Any Pronouns, and Ask Me.
- Templates automatically match existing roles by common aliases.
- Added an explicit opt-in to create missing template roles in Discord.
- Limited the role picker to roles below Orbit and added server-side channel, permission, hierarchy, managed-role, and 10-option validation.
- Disabled mention parsing in panel copy and clean up incomplete database records when Discord refuses the post.

## 0.1.0-alpha.45 — Reliable Ticket Panels
- Added Direct Ticket Button and Category Dropdown panel modes.
- Added editable panel copy, direct-category selection, button labels, success links, and actionable Discord error codes/references.
- Deferred ticket interactions immediately and moved channel creation to the existing job queue to avoid Discord interaction timeouts.
- Added idempotent interaction tracking so queue retries cannot create duplicate tickets.
- Explicitly grants Orbit access to each private ticket channel after denying `@everyone`.
- Displays form responses in a bounded Discord embed and reports opening-message failures without hiding the created ticket.
