
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
- **alpha.54** — Community Engagement question prompts with adjustable cadence, uploadable `.txt` banks, persistent duplicate prevention, and Queue-backed delivery
- **alpha.55** — Selectable bundled Community Engagement sample banks loaded directly from the Orbit dashboard
- **alpha.56** — Shared Reliability Control Plane: Permission Doctor, resource-drift repair signals, Action Center history, rate-limit visibility, supervised Gateway heartbeat health, and event RSVP panels
- **alpha.57** — Events page data-loading fix and actionable stale Discord resource diagnostics
- **alpha.58** — Discord data refresh, creator feed/status controls, stream-end/VOD automations, editable queue workflows, manual leveling tools, Mentionable-role repair, and large-server search
- **alpha.59** — TikTok OAuth/video relay, separate short-form video publishing queue, YouTube/TikTok/Instagram API connections, platform-aware social text limits, and explicit Discord post-now/schedule controls
- **alpha.60** — Direct short-form video file uploads through R2, public media serving for provider retrieval, and guarded editing of existing Discord categories and channels
- **alpha.61** — Bound direct video uploads to the `orbit-storage` R2 bucket through the Wrangler-generated `orbit_storage` binding, while retaining compatibility with older `STORAGE` deployments
- **alpha.62** — Added server-owner-only My Stream Twitch OAuth, selected Discord destination and role ping controls, editable live messages, reconnect/delete actions, encrypted owner account linkage, and duplicate-safe stream-ID polling
- **alpha.71** — Added the configurable Discord Counting module with Gateway validation, alternating-user and reset rules, reactions, activity history, and dashboard controls
- **alpha.72** — Added private month/day birthday registration, annual timezone-aware announcements, optional role pings, opt-out controls, and duplicate protection
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

## 0.1.0-alpha.46 — Ticket Resolution + Category Editing
- Added required-reason Discord modals for closing and deleting tickets.
- Close keeps the ticket channel and history while removing the opener's ability to send messages.
- Delete is restricted to configured ticket staff, Manage Channels, or Administrator and removes the Discord channel.
- Preserved close/delete reasons, timestamps, and acting users in Orbit's ticket records and audit history.
- Added in-place editing for ticket category details, staff roles, enabled state, ordering, parent category, and form questions.
- Added a dashboard reminder to repost ticket panels after category changes so Discord's existing message is not mistaken for the updated configuration.

## 0.1.0-alpha.47 — Owner-Only Channel Manager

- Added an owner-only bulk channel/category manager with API-level ownership checks.
- Added dependency-aware delete previews, optional category cascade, exact confirmations and required audit reasons.
- Added queued per-item create/delete/restore jobs and structural backups.
- Added migration `0035_channel_manager.sql`.

## 0.1.0-alpha.48 — Drag-and-Drop Hierarchy + Safer Sends

- Added visual ordering for existing categories/channels and Bulk Create plans.
- Added cross-category channel moves plus arrow-button ordering fallback.
- Added preview fingerprints, exact phrases, acknowledgement checkboxes, duplicate-operation protection, and immediate button locks.
- Added first-frame dashboard loading animation and visible Scheduled Posts progress.
- Normalized standard dashboard checkboxes to a compact 16px size.
- No new migration, secret, scope, or permission.

## 0.1.0-alpha.49 — Security & Reliability Hardening

- Fixed the connection OAuth authorization truthiness bypass and reused the loaded session in guild authorization.
- Added central same-guild channel/role validation for high-risk dashboard mutations.
- Added safe Discord mention defaults with explicit role/user allowlists.
- Added scheduler, social publisher, and Channel Manager leases plus stale-work recovery.
- Added per-channel protection outcomes and retained failed restore snapshots.
- Added encrypted Discord OAuth refresh-token sessions.
- Added DST-aware scheduler recurrence and a four-test regression suite.
- Added atomic Ko-fi total increments and conditional XP cooldown awards.
- Added outbound public-HTTPS checks, log retention, stronger log redaction, and a reproducible dependency lockfile.
- Added migration `0036_security_reliability_hardening.sql`.

## 0.1.0-alpha.50 — Gateway Recovery + Clearer Diagnostics

- Added an owner-only, exact-phrase-confirmed Gateway retry that exposes the existing guarded force-recovery path.
- Added in-dashboard setup guidance for Discord's Server Members and Message Content privileged intents.
- Kept the five-minute retry cooldown, IDENTIFY budget floor, and terminal halt protections intact.
- Added audit history for every owner force-retry request.
- Separated the core health score from optional social-connection warnings.
- Split failures from the last hour from older retained error history in Diagnostics and Logs.
- Added a one-click draft correction for unknown Channel Manager categories; it never sends changes without the existing preview and owner confirmation.
- No new migration, secret, OAuth scope, bot permission, Queue binding, or Durable Object.

## 0.1.0-alpha.51 — Reward + Panel Editing and Welcome Reliability

- Added a current Leveling role-reward list and guild-scoped reward editing.
- Separated XP settings from reward creation to prevent accidental duplicates.
- Added editing for existing Role Panels, including Discord message updates and missing-message repair.
- Preserved member role assignments and fixed panel destinations during edits.
- Added a test welcome action, explicit member mention allowlisting, and sanitized welcome/goodbye/auto-role failure logs.
- Isolated Community welcome handling from Shield join-processing failures.
- Added a dedicated Diagnostics navigation link.
- No new migration, secret, OAuth scope, bot permission, Queue binding, or Durable Object.

## 0.1.0-alpha.52 — Discord Audit Feed

- Added an opt-in Logs-page setting that forwards every new Orbit audit event to a selected Discord channel.
- Added queued, lease-protected, duplicate-resistant delivery and a Send Test Log action.
- Limited Discord summaries to safe metadata and disabled member pings.
- Temporary Discord failures retry; permanent permission/access failures stop and enter the sanitized error log.
- Added migration `0037_discord_audit_feed.sql` for feed enablement and per-event delivery state.
- No new secret, OAuth scope, Discord permission, Queue binding, Durable Object, or token reset.

## 0.1.0-alpha.53 — Reliability Foundation

- Prevented bot/webhook messages from recursively triggering message automations.
- Made unknown automation conditions fail closed and Discord action failures visible.
- Added shared timeouts to third-party HTTP requests.
- Added bounded queue retries, terminal failure states, and Audit Feed outbox recovery.
- Added bounded Scheduled Post and social publishing attempts.
- Removed Role Panel N+1 reads, batched item writes, and added Discord compensation after a D1 edit failure.
- Made multi-role selections and Level rewards report partial Discord failures accurately.
- Added cancellable dashboard page requests and stopped stale navigation from polluting diagnostics.
- Added four behavioral reliability tests, browser syntax validation, and `npm run check`.
- No new migration, secret, OAuth scope, Discord permission, Queue binding, Durable Object, or token reset.

- **alpha.63** — Added public Privacy Policy and Terms of Service pages with footer links for Google OAuth consent setup.
- **alpha.64** — Fixed owner-only My Stream saves inserting `NULL` into the required `last_live_state` field.
