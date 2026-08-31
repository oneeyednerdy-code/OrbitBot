# Cloudflare Foundation

Orbit remains Cloudflare-first.

## D1

D1 is the durable relational store for guild configuration, role systems, moderation cases, tickets, XP, automations, queued posts, Ko-fi state, social integration metadata, diagnostics, and audit history.

Apply migrations in order. `0006_orbit_foundation.sql` creates the roadmap tables without enabling unfinished features.

```bash
npm run db:local
npm run db:remote
```

## KV (staged binding: `CACHE`)

Use KV only for cacheable/short-lived derived data such as Discord metadata caches, idempotency hints, and non-authoritative feature flags. D1 remains authoritative.

Create when the first cache-backed module ships:

```bash
npx wrangler kv namespace create ORBIT_CACHE
```

Then bind it as `CACHE` in `wrangler.jsonc`.

## R2 (staged binding: `STORAGE`)

R2 is reserved for ticket transcripts, future uploaded scheduler media, and larger generated artifacts. Do not put access tokens/secrets in R2.

```bash
npx wrangler r2 bucket create orbit-storage
```

Then bind it as `STORAGE`.

## Queues (staged binding: `JOBS`)

Queue jobs are already typed in `src/types.ts` and a consumer foundation exists in `src/modules/scheduler/jobs.ts`. Do not activate a Queue until the first asynchronous module is ready.

```bash
npx wrangler queues create orbit-jobs
```

Then add a producer binding named `JOBS` plus a queue consumer in `wrangler.jsonc`.

## Cron

The scheduler sweep handler exists but no active Cron Trigger is included yet. This is deliberate: an idle every-minute cron would waste invocations before the scheduler ships. Activate it with the Scheduler module.

Recommended initial cadence when enabled:

```jsonc
"triggers": {
  "crons": ["* * * * *"]
}
```

## Turnstile

The existing Turnstile integration remains server-side. Browser code receives only the public site key. `TURNSTILE_SECRET_KEY` remains a Worker secret and Siteverify validates the returned token, action, and hostname.

## Secrets

Keep these in Worker secrets rather than source control:
- `DISCORD_CLIENT_SECRET`
- `DISCORD_BOT_TOKEN`
- `DISCORD_PUBLIC_KEY`
- `SESSION_SECRET`
- `TURNSTILE_SECRET_KEY`

Future social access/refresh tokens should also be encrypted or referenced through a credential abstraction; they should never be returned to dashboard JavaScript.
