> **FIRST TIME SETUP:** Open `START-HERE.md` and follow it from top to bottom.

# orbitBot (Orby) — v0.1.0-alpha.2

Testable Cloudflare-first alpha for Nerdspace Labs Discord access management.

## Included
- Discord OAuth (`identify guilds`) dashboard login
- Lists servers the signed-in user can manage
- Server role selectors for rules, verified, and manager-selected combined role
- D1 configuration + verification sessions
- Discord HTTP interactions endpoint with Ed25519 verification
- Rules-agreement button handler
- Cloudflare Turnstile verification endpoint
- Combined-role evaluator
- Secure cookies and baseline security headers

## Important alpha limitation
This build does **not** run a persistent Discord Gateway connection. Role evaluation occurs when Orby itself handles rules/verification. A later Gateway companion or reconciliation job is needed to instantly react when unrelated bots/admins add/remove prerequisite roles.

## 1. Create Discord application
In Discord Developer Portal create an application + bot named Orby.

Record:
- Application/Client ID
- Client Secret
- Public Key
- Bot Token

OAuth redirect for local testing:
`http://localhost:8787/oauth/callback`

OAuth login uses only `identify` + `guilds`. Discord documents `guilds` as the scope used to list the user's guilds.

Install Orby into the test server with `bot` + `applications.commands`. Give Orby **Manage Roles** plus the channel permissions needed to post the rules message. Do not give Administrator. Move the Orby role above every role it will grant/remove.

## 2. Install
```bash
npm install
```

Copy `.dev.vars.example` to `.dev.vars` and fill Discord credentials.

For local Turnstile testing, the included sitekey/secret are Cloudflare's always-pass test pair.

## 3. Create D1
```bash
npx wrangler d1 create nerdspace-orbitbot
```
Copy the returned database ID into `wrangler.jsonc`.

Then:
```bash
npm run db:local
```

## 4. Run
```bash
npm run dev
```
Open `http://localhost:8787`.

## 5. Discord interaction endpoint
For a public deployed Worker set Discord's Interactions Endpoint URL to:
`https://YOUR-DOMAIN/interactions`

Discord will validate the endpoint with a signed PING. The Worker validates `X-Signature-Ed25519` and `X-Signature-Timestamp` before accepting it.

## 6. Deploy
Set production secrets:
```bash
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Change `APP_ORIGIN` and `TURNSTILE_SITE_KEY` in `wrangler.jsonc`, then:
```bash
npm run db:remote
npm run deploy
```

Add the production OAuth callback in Discord:
`https://YOUR-DOMAIN/oauth/callback`

## Testing role configuration
Dashboard → Login with Discord → select server → choose:
- Rules role
- Verified role
- Combined role (whatever role the manager wants)

Save. Orby never hardcodes `Nerdspace Labs Technician`.

## Next alpha patch
Add dashboard-driven posting of the rules panel and a Discord-native `/verify` command/button that creates the signed 15-minute verification URL. The backend endpoints and tables for these flows are already scaffolded.


## Security hardening in alpha.2
This package now includes CSRF + Origin protection, encrypted OAuth tokens at rest, stricter role validation/hierarchy enforcement, stricter Turnstile hostname/action validation, HSTS/CSP hardening, logout/session invalidation, and dedicated setup/security guides. See `DISCORD_SETUP.md` and `SECURITY.md`.


## Alpha.4: Admin notifications
Server managers can select an optional Discord text channel for Orby access notifications. Orby posts when the configured combined role is granted or removed. Notification delivery is best-effort: a logging failure never rolls back a successful role change. The D1 audit log records role actions and notification failures.
