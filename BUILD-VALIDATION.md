# Orbit v0.1.0-alpha.41 — Build Validation

Validated on 2026-09-01.

## Passed

- Browser JavaScript syntax: every file in `public/js/` and `public/js/pages/` passes `node --check`.
- TypeScript syntax: every file in `src/` transpiles with TypeScript 5.8.3.
- Strict TypeScript validation: full `src/` tree passes `tsc --strict` against a local Cloudflare API type shim used only for validation.
- D1 migration chain: all 31 migrations apply cleanly to an empty SQLite database and create 57 application tables.
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
- Login page and dashboard footer both display `v0.1.0-alpha.41`.
- Diagnostics and Logs return usable responses when `orbit_error_log` is absent and name migration `0029_social_auth_verbose_errors.sql` as the required recovery.
- Unexpected D1 failures other than the specifically detected missing table continue to propagate as server errors.
- Community and Leveling renderers verify page ownership after asynchronous requests and before refresh/error rendering.
- Verification panels create private 15-minute links bound to the Discord member who clicked the panel button.
- Verification panel posting validates the configured Verified role and that the selected text channel belongs to the managed guild.

## Environment limitation

`npm install` timed out in the sandbox, so the exact project-pinned `@cloudflare/workers-types` package could not be installed here. Run the normal deployment-machine checks before production:

```bash
npm install
npm run typecheck
```

If Discord previously reset the bot token, follow `ALPHA36-RECOVERY.md` before installing its replacement.
