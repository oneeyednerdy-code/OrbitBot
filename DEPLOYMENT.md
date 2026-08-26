# orbitBot v0.1.0-alpha.4 — Deployment Guide

## 1. Requirements
- Node.js and npm
- Cloudflare account
- Discord application/bot for Orby
- Production Turnstile widget
- A hostname for orbitBot

## 2. Install
```bash
npm install
npx wrangler login
```

## 3. Create D1
```bash
npx wrangler d1 create nerdspace-orbitbot
```
Copy the returned database ID into `wrangler.jsonc`.

Apply migrations:
```bash
npm run db:remote
```

## 4. Configure the production hostname
Replace these placeholders in `wrangler.jsonc`:
- `APP_ORIGIN` with the exact HTTPS origin, with no trailing slash.
- `TURNSTILE_SITE_KEY` with the production site key.
- `TURNSTILE_HOSTNAMES` with the allowed hostname.

Add a Cloudflare Worker custom domain/route after the first deploy, or declare the route in Wrangler once the hostname is final.

## 5. Add Worker secrets
Never put these values in `wrangler.jsonc` or Git:
```bash
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
```
`SESSION_SECRET` should be a long cryptographically random value.

## 6. Discord URLs
In the Discord Developer Portal configure:
- OAuth redirect: `https://YOUR_HOST/oauth/callback`
- Interactions endpoint: `https://YOUR_HOST/interactions`

See `DISCORD_SETUP.md` for the full Discord configuration and least-privilege permissions.

## 7. Deploy
```bash
npm run deploy
```

## 8. Cloudflare security before public testing
- Enable WAF managed protections appropriate to the zone.
- Add rate limits for `/oauth/*`, `/verify/*`, `/api/*`, and `/interactions` as appropriate.
- Restrict the Turnstile widget to the production hostname.
- Keep development/test Turnstile keys out of production.
- Use HTTPS only.

## 9. Smoke test
1. Open the orbitBot site in a private browser window.
2. Login with Discord.
3. Confirm only manageable servers are listed.
4. Select a test server.
5. Select three distinct roles below Orby's highest role.
6. Save configuration.
7. Open another browser/device and confirm the same configuration loads from D1.
8. Test Rules + Verified => Combined role.
9. Remove one prerequisite role and confirm Combined is removed when configured.
10. Confirm unauthorized users cannot modify the server configuration.

## Important
Do not give Orby Discord Administrator permission. Put Orby's role above every role it is expected to grant/remove.
