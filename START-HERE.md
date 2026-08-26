# orbitBot v0.1.0-alpha.6 — START HERE

This patch fixes the OAuth `Invalid OAuth state` problem by storing short-lived, one-time OAuth states in D1 instead of relying on a browser cookie. The state is still random, expires after 10 minutes, and is consumed on callback.

## 1. Install

Open PowerShell in this folder.

```powershell
npm install
```

Do **not** install `@cloudflare/workers-types` manually. Wrangler 4 is used for Worker types and deployment.

## 2. Cloudflare

Make sure you are logged in:

```powershell
npx wrangler login
```

Create the D1 database if you have not already:

```powershell
npx wrangler d1 create nerdspace-orbitbot
```

Copy the returned database ID into `wrangler.jsonc`.

Apply migrations:

```powershell
npx wrangler d1 migrations apply DB --remote
```

Cloudflare records applied migrations in D1, so rerunning the command applies only unapplied migrations. citeturn0search11

## 3. Turnstile

Create a Turnstile widget for:

`orbitbot.oneeyednerdy.workers.dev`

Use **Managed** mode. Put the public Site Key in `wrangler.jsonc` as `TURNSTILE_SITE_KEY`.

Put the private Secret Key into Cloudflare:

```powershell
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Never put the secret key in `wrangler.jsonc`. Cloudflare recommends Worker secrets for tokens and API credentials. citeturn0search1turn0search3

## 4. Discord OAuth

In Discord Developer Portal → your orbitBot application → OAuth2 → General, add this exact redirect:

`https://orbitbot.oneeyednerdy.workers.dev/oauth/callback`

Do not add a trailing slash.

Use scopes:
- `identify`
- `guilds`

## 5. Discord secrets

Set these one at a time:

```powershell
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put SESSION_SECRET
```

Generate a session secret with:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToHexString($bytes).ToLower()
```

Cloudflare's current Wrangler supports declaring required secret **names** in `secrets.required`; those names are validated at deploy time. citeturn0search0turn0search2

## 6. Deploy

```powershell
npm install
npx wrangler deploy
```

The build disables Preview URLs because OAuth and Turnstile are deliberately restricted to the production hostname.

## 7. Test OAuth

Open:

`https://orbitbot.oneeyednerdy.workers.dev`

Click **Continue with Discord**. Discord should return to:

`https://orbitbot.oneeyednerdy.workers.dev/oauth/callback`

If you see `Invalid OAuth state`, make sure the D1 migration `0004_oauth_state.sql` has been applied. Do not remove state validation.

## 8. Configure Orby

1. Select your test server.
2. Choose the Rules role.
3. Choose the Verified role.
4. Choose any manageable Combined role.
5. Choose an optional admin log channel.
6. Save.

The configuration is stored in D1, so it follows the Discord server across browsers and devices.

## 9. Test the complete flow

- Rules button grants the Rules role.
- Turnstile verification grants the Verified role.
- Both roles grant the Combined role.
- Removing either requirement removes the Combined role when enabled.
- Admin log messages report grants/removals without pinging members.
- Log into the dashboard from another browser and confirm the server configuration remains.

## Security rule

Never paste Discord Client Secrets, Bot Tokens, Turnstile Secret Keys, or session secrets into chat, GitHub, `wrangler.jsonc`, or browser JavaScript. Use Cloudflare Worker secrets. citeturn0search3
