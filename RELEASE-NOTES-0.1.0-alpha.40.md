# Orbit v0.1.0-alpha.40 — Diagnostics Schema Recovery

Alpha.40 fixes the Diagnostics and Logs 500s reported from an alpha.38 deployment.

## Root cause

Both routes attempted to read `orbit_error_log`. The deployed D1 database had not applied `0029_social_auth_verbose_errors.sql`, so SQLite returned `no such table: orbit_error_log` and both endpoints failed.

## Changes

- Diagnostics catches only the specific missing-`orbit_error_log` schema error and returns the rest of its health report.
- Diagnostics adds a failed **Verbose error log** check naming migration 0029 and the recovery command.
- Logs continues to return core audit activity when verbose error history is unavailable.
- Logs displays a setup notice instead of a generic 500.
- Other database failures are not swallowed and still produce server errors with request references.

## Required deployment recovery

Run the pending remote migrations before or immediately after deploying alpha.40:

```bash
npm run db:remote
```

No new migration, secret, OAuth scope, or Discord permission is added by alpha.40.
