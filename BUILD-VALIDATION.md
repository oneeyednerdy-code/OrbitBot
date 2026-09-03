# Orbit v0.1.0-alpha.51 — Build Validation

Validated on 2026-09-03.

## Passed

- Browser JavaScript syntax: every file in `public/js/` and `public/js/pages/` passes `node --check`.
- TypeScript strict check: `tsc --noEmit` passes with TypeScript 5.9.3.
- Worker bundle: the complete Worker bundles successfully with esbuild.
- Unit tests: fourteen regression tests pass across scheduler recurrence, OAuth authorization, guild-resource middleware, safe mentions, retained restore snapshots, Gateway recovery authorization, diagnostics grouping, Channel Manager category recovery, Level reward editing, Role Panel editing, and welcome delivery.
- D1 migration chain: all 36 migrations apply cleanly to an empty SQLite database and create 62 application tables.
- Gateway source audit confirms:
  - `/gateway/bot` preflight before fresh IDENTIFY,
  - Gateway RESUME support,
  - terminal close-code halt handling,
  - heartbeat ACK tracking,
  - exponential backoff,
  - single reconnect path,
  - persisted Durable Object safety state,
  - IDENTIFY budget floor protection.
- Package contains no `node_modules`.
- Scheduled Posts preview preserves entered newlines and blank lines with safe text rendering.
- Scheduler UI and API enforce Discord's 2,000-character message limit, including an optional role mention.
- Login page and dashboard footer both display `v0.1.0-alpha.51`.
- Leveling lists every configured role reward and updates rewards through guild-scoped, duplicate-protected mutations.
- Role Panel edits update the original Discord message and existing database row; a missing message is safely reposted in the same channel.
- Community welcome messages include a delivery test, bounded member mention allowlist, sanitized Discord failure logs, and isolation from Shield join failures.
- A dedicated Diagnostics navigation link exposes the existing full-page diagnostics renderer.
- Gateway force retry is restricted to the Discord server owner, requires an acknowledgement and the exact phrase `RETRY GATEWAY`, retains the five-minute cooldown, and creates an audit event.
- The dashboard explains the required Server Members and Message Content privileged intents when Discord halts the Gateway with `disallowed_intents`.
- Core health scoring excludes optional social integrations while leaving those checks visible in a separate section.
- Diagnostics and Logs distinguish failures from the last hour from older retained error history.
- Unknown Channel Manager parent categories return a structured correction that can add missing category names to the draft and re-preview without sending changes to Discord.
- Connection OAuth rejects every non-`ok` guild authorization result.
- Guild mutations centrally validate submitted channel and role IDs against the managed server.
- Discord message sends default to `allowed_mentions.parse=[]` unless a bounded explicit allowlist is supplied.
- Scheduled and social posts use expiring dispatch leases; Channel Manager jobs use leases, heartbeats, and uncertain-retry protection.
- Protection restores delete only successfully restored snapshots and retain failures with request references.
- Discord dashboard access tokens refresh from encrypted refresh tokens within a 30-day session lifetime.
- Scheduled recurrence advances from the prior scheduled time in the configured timezone rather than completion time.
- Stale page responses are cancelled before old renderers can replace nodes after navigation.
- Ko-fi totals increment atomically and require a transaction id; XP cooldown awards use a conditional atomic UPSERT.
- RSS and Mastodon user-supplied destinations require public HTTPS URLs and do not follow redirects.
- Existing categories and channels can be reordered with drag-and-drop; channels can move between categories or become uncategorized.
- Bulk Create previews support ordering new categories and moving new channels among new/existing categories before validation.
- Arrow controls provide a keyboard and mobile-friendly within-group ordering fallback.
- Reorder previews require a current-layout fingerprint, exact phrase, acknowledgement, owner authorization, Manage Channels, and an automatic backup.
- Channel Manager accepts only one queued/running operation per server and immediately locks action buttons against double submission.
- Dashboard navigation paints an animated transition before loading page data, with reduced-motion support.
- Scheduled Posts paints immediate progress before its create/action API request and restores an actionable state on failure.
- Standard checkboxes render at a consistent 16px without changing custom feature-selection controls.
- Channel Manager is hidden from non-owners and independently rejects non-owner API calls.
- Delete previews expand optional category cascades, block active Orbit/Discord dependencies, require a reason and exact confirmation, and are revalidated before queueing.
- Create, delete and structural restore operations run through the existing queue with per-item outcomes and Discord audit-log reasons.
- Automatic and named backups explicitly exclude messages, threads, attachments and webhooks; restored channels receive new Discord IDs.
- Diagnostics and Logs return usable responses when `orbit_error_log` is absent and name migration `0029_social_auth_verbose_errors.sql` as the required recovery.
- Unexpected D1 failures other than the specifically detected missing table continue to propagate as server errors.
- Community and Leveling renderers verify page ownership after asynchronous requests and before refresh/error rendering.
- Verification panels create private 15-minute links bound to the Discord member who clicked the panel button.
- Verification panel posting validates the configured Verified role and that the selected text channel belongs to the managed guild.
- Role-gated Community Alerts validate the selected Discord role/channel, check only Creator Directory member IDs, and persist per-platform state to prevent duplicate live announcements.
- Eligibility-role checks do not require enumerating the full Discord member list or enabling a new privileged intent.
- Twitch app tokens are reused until expiry, and YouTube live checks use the low-cost `videos.list` endpoint after discovering the latest video through the public channel feed.
- Tickets verifies page and guild ownership after its asynchronous load, before action refreshes, and before rendering errors.
- Role Panel quick templates match existing Discord roles and create missing roles only after the administrator explicitly enables that option.
- Panel creation validates the destination channel, 10-role limit, Manage Roles permission, managed-role status, and Orbit's role hierarchy before posting.
- Role Panel messages disable automatic mention parsing, and failed Discord posts remove their incomplete database records.
- Ticket panels support a direct Open Ticket button or a category dropdown and surface Discord's message, code, and Orbit request reference when posting fails.
- Ticket clicks acknowledge Discord immediately, enqueue channel creation, and update the private interaction response when processing finishes.
- Migration `0033_ticket_interaction_jobs.sql` adds a unique interaction id for retry-safe ticket creation.
- Private ticket channels explicitly grant Orbit, the opener, and configured staff access after denying `@everyone`.
- Ticket Close and Delete actions require a Discord modal reason and use the existing job queue for deferred processing.
- Ticket forms and resolution prompts use Discord's current Label-wrapped text-input structure while accepting nested modal submit values.
- Close preserves the channel/history while denying the opener Send Messages; Delete is restricted to configured ticket staff, Manage Channels, or Administrator.
- Migration `0034_ticket_resolution_reasons.sql` preserves close/delete timestamps, actors, and reasons in Orbit records.
- Existing ticket categories can be edited in place with guild-scoped server validation, and the dashboard prompts administrators to repost changed panels.

## Deployment-machine checks

The release includes a dependency lockfile. Re-run the normal checks before production:

```bash
npm ci
npm test
npm run typecheck
```

If Discord previously reset the bot token, follow `ALPHA36-RECOVERY.md` before installing its replacement.
