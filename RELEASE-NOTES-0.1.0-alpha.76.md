# Orbit v0.1.0-alpha.76 — Counting Save Recovery

- Counting now reports a specific migration-required response instead of a generic 500 when the deployed D1 schema is missing a Counting table or column.
- Fixed the Counting configuration upsert’s missing `same_user_message` placeholder, which caused every save to fail with a generic server error.
- The upsert now uses explicit SQL NULLs for nullable fields.
- Counting errors now include the Orbit request reference when one is available.

## Upgrade

From the project directory, apply the cumulative D1 migrations and redeploy:

```bash
npm run db:remote
npm run deploy
```
