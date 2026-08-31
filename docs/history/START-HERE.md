# Orbit v0.1.0-alpha.8 — START HERE

## 1. Install dependencies

```powershell
npm install
```

## 2. Cloudflare login + D1

```powershell
npx wrangler login
npx wrangler d1 create nerdspace-orbitbot
```

Put the returned database ID into `wrangler.jsonc`, then apply all migrations including `0006_orbit_foundation.sql`:

```powershell
npx wrangler d1 migrations apply DB --remote
```

## 3. Configure Turnstile

Keep the existing production Turnstile widget. Set its public site key in `wrangler.jsonc` and keep the secret in Worker secrets:

```powershell
npx wrangler secret put TURNSTILE_SECRET_KEY
```

`TURNSTILE_HOSTNAMES` must contain the exact allowed production hostname(s).

## 4. Discord OAuth + installation

In Discord Developer Portal → OAuth2, add exactly:

`https://YOUR-ORBIT-HOST/oauth/callback`

Dashboard login uses `identify guilds`.

You no longer need to manually construct the bot invite URL. Orbit provides **Add Orbit to Discord** on the landing page and dashboard. Discord presents its own server picker and permission review. A user must own the server or have Manage Server permission to add the app.

The foundation install intentionally requests only permissions needed by currently active access features:
- Manage Roles
- View Channels
- Send Messages
- Read Message History

**Administrator is not requested.** Future modules that need additional permissions should explicitly request a permission update when they activate.

## 5. Worker secrets

```powershell
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Never put these values in Git, browser JavaScript, dashboard forms, screenshots, or chat logs.

## 6. Deploy

```powershell
npm run db:remote
npm run deploy
```

Set Discord's interaction endpoint to:

`https://YOUR-ORBIT-HOST/interactions`

## 7. First dashboard test

1. Open Orbit.
2. Sign in with Discord.
3. Confirm servers you can manage appear in the server picker.
4. Choose a server where Orbit is not installed and test **Add Orbit to this server**.
5. Return to Orbit and refresh/select the server.
6. Open Verification.
7. Select Rules, Verified, and Combined roles.
8. Ensure Orbit's Discord role is above those roles.
9. Save.
10. Test Rules + Turnstile verification → Combined access.

## 8. Future Cloudflare bindings

KV (`CACHE`), R2 (`STORAGE`), and Queue (`JOBS`) contracts are staged in the code but are intentionally not active yet. See `CLOUDFLARE-FOUNDATION.md`. This avoids paying for or invoking idle infrastructure before the associated modules ship.
