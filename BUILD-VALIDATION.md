# Orbit v0.1.0-alpha.43 — Build Validation

Validated on 2026-09-01.

## Passed

- Browser JavaScript syntax: every file in `public/js/` and `public/js/pages/` passes `node --check`.
- TypeScript syntax: every file in `src/` transpiles with TypeScript 5.8.3.
- D1 migration chain: all 32 migrations apply cleanly to an empty SQLite database and create 59 application tables.
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
- Login page and dashboard footer both display `v0.1.0-alpha.43`.
- Diagnostics and Logs return usable responses when `orbit_error_log` is absent and name migration `0029_social_auth_verbose_errors.sql` as the required recovery.
- Unexpected D1 failures other than the specifically detected missing table continue to propagate as server errors.
- Community and Leveling renderers verify page ownership after asynchronous requests and before refresh/error rendering.
- Verification panels create private 15-minute links bound to the Discord member who clicked the panel button.
- Verification panel posting validates the configured Verified role and that the selected text channel belongs to the managed guild.
- Role-gated Community Alerts validate the selected Discord role/channel, check only Creator Directory member IDs, and persist per-platform state to prevent duplicate live announcements.
- Eligibility-role checks do not require enumerating the full Discord member list or enabling a new privileged intent.
- Twitch app tokens are reused until expiry, and YouTube live checks use the low-cost `videos.list` endpoint after discovering the latest video through the public channel feed.
- Tickets verifies page and guild ownership after its asynchronous load, before action refreshes, and before rendering errors.

## Environment limitation

`npm install` timed out in the sandbox, so the exact project-pinned `@cloudflare/workers-types` package could not be installed here. Run the normal deployment-machine checks before production:

```bash
npm install
npm run typecheck
```

If Discord previously reset the bot token, follow `ALPHA36-RECOVERY.md` before installing its replacement.
