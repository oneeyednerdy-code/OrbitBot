# Orbit v0.1.0-alpha.37 — Build Validation

Validated on 2026-08-31.

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

## Environment limitation

`npm install` timed out in the sandbox, so the exact project-pinned `@cloudflare/workers-types` package could not be installed here. Run the normal deployment-machine checks before production:

```bash
npm install
npm run typecheck
```

Then deploy alpha.36 **before** installing a replacement Discord bot token if Discord has already reset the token.
