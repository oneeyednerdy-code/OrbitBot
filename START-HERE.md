# orbitBot (Orby) v0.1.0 Alpha — START HERE

This guide assumes you have never set up a Discord bot, Cloudflare Worker, D1 database, or Turnstile before. Follow it from top to bottom. Do not skip the security warnings.

## What you are building

A Discord member can accept your rules and complete human verification. Orby grants the two roles you choose. When both required roles are present, Orby grants a third role that YOU choose. Orby can also post grant/removal notices to an admin channel you choose.

Your settings are stored in Cloudflare D1, so they persist across browsers and devices.

---

## Before you start

You need:

1. A Discord account with permission to manage your test server.
2. A Cloudflare account.
3. Node.js and npm installed on your computer.
4. This ZIP extracted to a folder.
5. A test Discord server. Testing in a test server first is strongly recommended.

**NEVER share your Discord Bot Token, Discord Client Secret, Turnstile Secret Key, or SESSION_SECRET. Never commit them to GitHub.**

---

# Part 1 — Create Orby in Discord

## Step 1 — Create the Discord application

1. Open the Discord Developer Portal: https://discord.com/developers/applications
2. Sign in.
3. Click **New Application**.
4. Name it **orbitBot**.
5. Accept Discord's developer terms if prompted.
6. Click **Create**.
7. Leave this browser tab open.

## Step 2 — Copy the Application ID

1. In your orbitBot application, open **General Information**.
2. Find **Application ID**.
3. Copy it somewhere private temporarily.
4. This becomes `DISCORD_CLIENT_ID` later.

The Application ID is not a password, but keep your deployment notes private anyway.

## Step 3 — Copy the Discord Public Key

1. Still under **General Information**, find **Public Key**.
2. Copy it.
3. This becomes `DISCORD_PUBLIC_KEY` later.

Orby uses this key to prove incoming Discord interaction requests really came from Discord.

## Step 4 — Create the bot user

1. In the left menu, click **Bot**.
2. If Discord shows **Add Bot**, click it and confirm.
3. Set the bot username/display name to **Orby** if desired.
4. Do NOT enable permissions simply because they are available.

## Step 5 — Get the Bot Token

1. On the **Bot** page, locate the token section.
2. Click **Reset Token** if Discord requires it.
3. Confirm the action.
4. Copy the token immediately.
5. Store it somewhere private until we add it to Cloudflare.
6. This becomes `DISCORD_BOT_TOKEN`.

**STOP: The Bot Token is a password. Do not paste it into README files, GitHub, screenshots, Discord, `wrangler.jsonc`, or browser JavaScript.**

If you accidentally expose it, return to Discord and reset it immediately.

## Step 6 — Get the Discord Client Secret

1. Return to **OAuth2** in the Discord Developer Portal.
2. Locate **Client Secret**.
3. Reset/generate it if Discord requires this.
4. Copy it privately.
5. This becomes `DISCORD_CLIENT_SECRET`.

**The Client Secret is also a password.**

## Step 7 — OAuth redirect URL

We need the final deployed Worker address before the production redirect can be completed. For now, remember where this setting is:

1. Discord Developer Portal → orbitBot → **OAuth2**.
2. Find **Redirects**.
3. After deployment, you will add:

`https://YOUR-ORBITBOT-DOMAIN/oauth/discord/callback`

The URL must match exactly.

---

# Part 2 — Install the project locally

## Step 8 — Open a terminal in the extracted project folder

For example, after extracting the ZIP, enter the folder containing `package.json`.

## Step 9 — Install dependencies

Run:

```bash
npm install
```

Do not continue if npm reports a fatal installation error.

## Step 10 — Sign in to Cloudflare Wrangler

Run:

```bash
npx wrangler login
```

A browser window should open. Approve the Cloudflare connection.

---

# Part 3 — Create Orby's D1 database

## Step 11 — Create D1

Run:

```bash
npx wrangler d1 create nerdspace-orbitbot
```

Cloudflare will return a database ID.

## Step 12 — Put the D1 ID in wrangler.jsonc

1. Open `wrangler.jsonc`.
2. Find the D1 binding named `DB`.
3. Replace the placeholder `database_id` with the real ID Cloudflare just gave you.
4. Save the file.

Do not change the binding name from `DB` unless you are intentionally changing the code too.

## Step 13 — Apply database migrations

Run:

```bash
npx wrangler d1 migrations apply nerdspace-orbitbot --remote
```

Confirm if Wrangler asks you to continue.

This creates Orby's persistent configuration, session/security, verification, audit, and admin-notification storage.

---

# Part 4 — Create Cloudflare Turnstile

## Step 14 — Open Turnstile

1. Sign into the Cloudflare dashboard.
2. Open **Turnstile**.
3. Click **Add widget** / **Add site** (Cloudflare wording may change).
4. Give it an obvious name such as **orbitBot Production**.

A "Turnstile widget" is simply the Cloudflare configuration that protects Orby's verification page.

## Step 15 — Configure the hostname

For production, add the hostname where Orby will run, for example:

`orbitbot.example.com`

If you are initially using a Workers development hostname, configure the hostname you actually intend to test according to Cloudflare's current Turnstile hostname options.

Do not configure an unrelated wildcard just to make setup easier.

## Step 16 — Copy the Turnstile keys

Cloudflare gives you two values:

- **Site Key** — public; used by the verification page.
- **Secret Key** — private; used only by the Worker.

The private value becomes `TURNSTILE_SECRET_KEY`.

**Never put the Turnstile Secret Key into browser JavaScript.**

Update the project's public Turnstile site-key configuration as described in `DEPLOYMENT.md`/the code comments for this alpha. Use only the public Site Key there.

---

# Part 5 — Create Orby's application secrets

## Step 17 — Generate SESSION_SECRET

Generate a strong random secret. One easy option with Node is:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the result. This is `SESSION_SECRET`.

Do not reuse your Discord token or any other password.

## Step 18 — Add secrets to Cloudflare

Run each command separately:

```bash
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Wrangler asks for each value. Paste the matching value and submit it.

Secrets should NOT appear in `wrangler.jsonc`.

---

# Part 6 — Deploy orbitBot

## Step 19 — Deploy

Run:

```bash
npx wrangler deploy
```

Wrangler will give you the deployed Worker URL unless you configured a custom domain.

Copy the final HTTPS address.

## Step 20 — Configure the production application URL

Set Orby's configured application/base URL or route values in `wrangler.jsonc` to the actual HTTPS origin required by this build, then redeploy if you changed configuration.

Do not use an HTTP production URL.

---

# Part 7 — Finish Discord OAuth

## Step 21 — Add the redirect URI

Return to Discord Developer Portal → orbitBot → **OAuth2** → **Redirects**.

Add exactly:

`https://YOUR-ORBITBOT-DOMAIN/oauth/discord/callback`

Example only:

`https://orbitbot.example.com/oauth/discord/callback`

Click **Save Changes**.

If Discord later reports `redirect_uri` errors, compare the dashboard value and Discord value character-for-character.

## Step 22 — OAuth scopes

The dashboard login uses the minimum user scopes required by this alpha:

- `identify`
- `guilds`

These allow Orby to identify the logged-in Discord user and display the guilds/servers they can manage. They do not give the browser your bot token.

---

# Part 8 — Configure Discord installation

## Step 23 — Installation scopes

When configuring the application's bot installation, include:

- `bot`
- `applications.commands`

## Step 24 — Bot permissions

**Do NOT give Orby Administrator.**

Orby needs only the permissions required for the features you enable. For the current alpha this includes the ability to manage the configured roles and send messages to the selected admin log/verification channels as required.

Most importantly, Orby needs **Manage Roles** for role grants/removals.

## Step 25 — Add Orby to your TEST server

Use Discord's installation/invite configuration to add the bot to your test server.

Do not start by testing against an important production community if you can avoid it.

## Step 26 — Fix the Discord role hierarchy

Discord only lets bots manage roles below the bot's own highest role.

In Discord:

1. Open **Server Settings**.
2. Open **Roles**.
3. Find Orby's bot role.
4. Move Orby's role ABOVE every role you expect Orby to grant or remove.
5. Save if Discord prompts you.

Example:

```text
Server Owner / Admin roles
Orby
Community Access
Verified
Agreed to Rules
@everyone
```

Do not move Orby above administrative roles it does not need to manage.

---

# Part 9 — Discord interaction endpoint

## Step 27 — Configure the endpoint

In the Discord Developer Portal, find the application's **Interactions Endpoint URL** setting.

Use:

`https://YOUR-ORBITBOT-DOMAIN/interactions`

Discord will test the endpoint. The Worker verifies Discord's Ed25519 signature before accepting interactions.

If Discord rejects the URL, check:

1. Worker is deployed.
2. URL is HTTPS.
3. `DISCORD_PUBLIC_KEY` is correct.
4. Endpoint path is exactly `/interactions`.
5. No proxy/redirect is changing the request before signature verification.

---

# Part 10 — Configure Orby in the dashboard

## Step 28 — Log in

Open your orbitBot URL.

Click **Login with Discord**.

Discord should show the OAuth authorization screen. Approve it.

## Step 29 — Select a server

Choose your TEST Discord server.

Only servers you are authorized to manage should be configurable.

If the server does not appear, verify your Discord permissions and make sure you logged into the correct Discord account.

## Step 30 — Choose the three roles

In the Verification/Access configuration choose:

1. **Rules Role** — example: `@Agreed to Rules`
2. **Verified Role** — example: `@Verified`
3. **Combined Access Role** — ANY role you want Orby to grant after both requirements are satisfied.

The combined role is NOT hardcoded. `@Nerdspace Labs Technician` is only an example.

Orby should reject roles it cannot safely manage.

## Step 31 — Automatic removal

Enable automatic removal if you want this behavior:

```text
Rules + Verified = Access Role

Lose Rules OR Verified = Access Role removed
```

This is recommended for access-control roles.

## Step 32 — Configure the admin notification channel

Enable Discord admin notifications and select a private admin/mod channel Orby can post in, such as `#orby-log`.

Choose which notices you want enabled.

Current role events include combined access-role grants and removals.

Example:

```text
orbitBot • Access Granted
@User has been granted @Community Member
```

Orby's log messages must not be treated as commands and are designed not to ping the mentioned user/role.

A notification failure must never roll back a successful role change.

---

# Part 11 — Test the complete flow

## Step 33 — Use a second Discord account if possible

Testing with a normal non-admin account is strongly recommended. Admin permissions can hide permission mistakes because administrators bypass many channel restrictions.

## Step 34 — Test rules

Have the test account agree to the rules using Orby's rules flow.

Confirm the configured Rules role appears on the member.

## Step 35 — Test verification

Have the test account open Orby's verification flow and complete Turnstile.

Confirm the configured Verified role is granted.

## Step 36 — Confirm combined access

Once BOTH prerequisite roles exist, confirm Orby grants the manager-selected Combined Access Role.

## Step 37 — Confirm the admin log

Open the configured private log channel.

Confirm Orby posted the access-granted message.

## Step 38 — Test automatic removal

Remove one prerequisite role from the test member.

Confirm Orby removes the Combined Access Role when automatic removal is enabled and posts the removal notice.

## Step 39 — Test cross-browser persistence

1. Save the server configuration in Browser A.
2. Log out.
3. Open Browser B or your phone.
4. Log into orbitBot with Discord.
5. Select the same server.
6. Confirm the same role and notification settings load.

This proves the configuration is coming from D1 rather than browser local storage.

---

# Part 12 — Security checks BEFORE real users

Do not invite real users into the flow until these are true:

- [ ] Discord Bot Token is stored only as a Cloudflare secret.
- [ ] Discord Client Secret is stored only as a Cloudflare secret.
- [ ] Turnstile Secret Key is stored only as a Cloudflare secret.
- [ ] SESSION_SECRET is strong and stored only as a Cloudflare secret.
- [ ] `.dev.vars` is not committed to Git.
- [ ] Production uses HTTPS.
- [ ] Discord OAuth callback exactly matches the production URL.
- [ ] Production Turnstile is restricted to the intended hostname(s).
- [ ] Orby does NOT have Administrator permission.
- [ ] Orby's role is above only the roles it needs to manage.
- [ ] Admin log channel is private to the intended staff.
- [ ] D1 migrations are applied.
- [ ] Dashboard configuration persists across browsers.
- [ ] Rules → Verify → Combined Role works with a normal test member.
- [ ] Removing a prerequisite removes access when configured.
- [ ] Discord interaction signature validation is working.
- [ ] Cloudflare WAF/rate-limit protections are configured for the public deployment as described in `SECURITY.md`.

---

# If something breaks

## Discord login says redirect URI mismatch

The OAuth callback configured in Discord and the callback sent by orbitBot do not exactly match. Check scheme (`https`), hostname, path, and trailing slash.

## Server is missing

Make sure the Discord account logged into orbitBot can actually manage that server.

## Orby cannot grant a role

Check Discord role hierarchy. Orby's bot role must be above the target role. Also make sure the role is not a Discord-managed/integration role.

## Verification fails

Check the Turnstile Site Key, Secret Key, allowed hostname, and Worker secret. Production and testing credentials must not be mixed accidentally.

## Admin notification does not appear

Confirm notifications are enabled, the correct channel is selected, Orby can view/send messages there, and the channel still exists. The role operation may still succeed even when the notification fails.

## Settings disappear in another browser

Confirm D1 is bound as `DB`, migrations were applied to the remote production database, and the deployment is using that same D1 database.

---

# Reference documents

After completing this guide, use these for deeper information:

- `DISCORD_SETUP.md` — Discord-specific reference
- `DEPLOYMENT.md` — Cloudflare/deployment reference
- `SECURITY.md` — security model and production hardening
- `README.md` — project overview

**For your first deployment, follow START-HERE.md first.**
