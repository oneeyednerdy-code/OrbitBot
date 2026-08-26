# orbitBot / Orby — Discord Bot & OAuth Setup

## 1. Create the application
1. Open the Discord Developer Portal and create an application named **orbitBot** (bot display name can be **Orby**).
2. On **General Information**, record the **Application ID** and **Public Key**.
3. On **OAuth2**, create/reset the **Client Secret**. Treat it as a secret.
4. On **Bot**, create the bot user and reset/copy the **Bot Token**. Treat it as a secret. Never put it in browser JavaScript, GitHub, screenshots, or chat logs.

## 2. OAuth2 dashboard login
Add redirect URIs that exactly match the deployment:
- Local: `http://localhost:8787/oauth/callback`
- Production: `https://YOUR-ORBITBOT-HOST/oauth/callback`

The dashboard login requests only `identify guilds`. The server selector filters to guilds where the signed-in user has Manage Server (`MANAGE_GUILD`) or Administrator. Sensitive writes re-check this permission server-side.

## 3. Install Orby
Use Discord's installation/OAuth generator with scopes:
- `bot`
- `applications.commands` (reserved for Discord-native commands as the alpha grows)

Minimum bot permissions for the v0.1 access flow:
- Manage Roles
- View Channels (where Orby posts)
- Send Messages (where Orby posts)
- Read Message History (recommended for managed panels)

**Do not grant Administrator.**

## 4. Role hierarchy
Discord only allows a bot to manage roles below the bot's highest role. Put the **Orby** role above the Rules, Verified, and Combined Access roles that managers select. The dashboard rejects invalid/managed roles and roles at or above Orby's highest role.

## 5. Interactions endpoint
After deploying to a public HTTPS hostname, set Discord's Interactions Endpoint URL to:
`https://YOUR-ORBITBOT-HOST/interactions`

Orby verifies Discord's Ed25519 signature before processing an interaction. Invalid signatures fail closed.

## 6. Secrets
Local development: copy `.dev.vars.example` to `.dev.vars`; never commit `.dev.vars`.

Production: store secrets with Wrangler:
```bash
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Generate `SESSION_SECRET` as a long random value (at least 32 random bytes). It encrypts Discord OAuth access tokens at rest using AES-GCM. Rotating it invalidates/decrypts no existing sessions, so log users out/clear sessions when rotating.

## 7. Turnstile
For local testing, Cloudflare's official always-pass test pair may be used. For production, create a dedicated Turnstile widget restricted to the orbitBot hostname and replace both the sitekey and secret. Set `TURNSTILE_HOSTNAMES` to the exact production hostname(s), without schemes or paths. Do not include localhost in production.

## 8. Final test
1. Start/deploy Orby.
2. Login with Discord.
3. Confirm only manageable servers are shown.
4. Select three distinct roles below Orby's role.
5. Save configuration.
6. Confirm invalid/higher roles are rejected.
7. Confirm a Rules + Verified member receives the manager-selected Combined role.
8. Remove one prerequisite and confirm the Combined role is removed when configured.
