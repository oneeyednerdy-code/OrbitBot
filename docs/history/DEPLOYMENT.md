# Orbit v0.1.0-alpha.8 — Deployment Guide

## Requirements
- Node.js + npm
- Cloudflare account
- Discord application/bot
- Existing production Turnstile widget
- Production hostname

## Install + D1

```bash
npm install
npx wrangler login
npx wrangler d1 create nerdspace-orbitbot
npm run db:remote
```

Copy the D1 database ID into `wrangler.jsonc` before applying migrations.

## Production variables
Set in `wrangler.jsonc`:
- `APP_ORIGIN`: exact HTTPS origin, no trailing slash
- `TURNSTILE_SITE_KEY`: public production site key
- `TURNSTILE_HOSTNAMES`: allowed hostname(s)

## Production secrets

```bash
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
```

## Discord configuration
- OAuth redirect: `https://YOUR_HOST/oauth/callback`
- Interactions endpoint: `https://YOUR_HOST/interactions`

Orbit generates its own install URL at `/oauth/install`; no manual invite URL is required.

## Deploy

```bash
npm run deploy
```

## Smoke test
1. Sign in with Discord.
2. Confirm manageable servers are listed.
3. Test installing Orbit from the dashboard into a server where it is absent.
4. Confirm the server bootstrap loads roles/channels/config in one dashboard request.
5. Configure three distinct roles below Orbit's highest role.
6. Test Rules + Verified → Combined role.
7. Test Turnstile on the production hostname.
8. Confirm admin-log notifications if enabled.

## Cloudflare security
- Enable appropriate WAF managed rules.
- Add rate limits for `/oauth/*`, `/verify/*`, `/api/*`, and `/interactions`.
- Keep Turnstile hostname-restricted.
- Keep D1 accessible only through Workers.
- Do not activate KV/R2/Queues until the corresponding module is ready; see `CLOUDFLARE-FOUNDATION.md`.
