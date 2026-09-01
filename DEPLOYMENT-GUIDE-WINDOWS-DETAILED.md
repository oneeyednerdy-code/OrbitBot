# Orbit v0.1.0-alpha.38 — Extremely Detailed Windows Deployment Guide

This is the step-by-step guide for deploying the **single cumulative Orbit build**. It assumes Windows 10/11 and PowerShell. Do not deploy the older alpha ZIPs first.

> **Important:** If Orbit is already deployed and already has a D1 database, use the **Existing Orbit** path below. Do **not** create a second D1 database.

---

## PART 1 — Before you touch the code

### 1. Gather the accounts you need

You need access to:

1. Your Cloudflare account.
2. Your Discord Developer Portal application for Orbit.
3. Your Cloudflare Turnstile widget for Orbit.
4. Your existing Orbit D1 database if you are upgrading.

Optional features also need:

- Twitch Developer credentials for Twitch Community Alerts.
- Google/YouTube API key for YouTube live detection.
- A separate Orbit social-credential encryption key for Bluesky/Mastodon/Threads credentials.

### 2. Decide which deployment path applies

Use **Path A — Existing Orbit** if Orbit is already deployed and you already have a D1 database.

Use **Path B — Brand-new Orbit** only if this is the first Orbit deployment.

---

# PART 2 — Install the local tools

## 3. Install Node.js

1. Open your browser.
2. Go to the official Node.js website.
3. Download the current LTS release. Orbit requires Node.js 20 or newer.
4. Run the installer.
5. Leave the normal defaults enabled, including npm.
6. Finish the installer.
7. Close any open PowerShell windows.
8. Open a new PowerShell window.
9. Run:

```powershell
node --version
```

You should see a version beginning with `v20`, `v22`, or newer.

10. Run:

```powershell
npm --version
```

You should see an npm version number.

If either command says it is not recognized, restart Windows and try again.

---

# PART 3 — Extract Orbit

## 4. Extract the ZIP

1. Download `Orbit-v0.1.0-alpha.36-SOCIAL-AUTH-EVENTS-FORMS.zip`.
2. Right-click the ZIP in File Explorer.
3. Choose **Extract All**.
4. Extract it somewhere easy to find, for example:

```text
C:\NerdspaceLabs\Orbit
```

5. Open the extracted folder.
6. Confirm you see files including:

```text
package.json
wrangler.jsonc
src\
public\
migrations\
DEPLOY-ME-FIRST.md
DEPLOYMENT-GUIDE-WINDOWS-DETAILED.md
```

## 5. Open PowerShell in the Orbit folder

The easiest method:

1. Open the Orbit project folder in File Explorer.
2. Click the address bar.
3. Type:

```text
powershell
```

4. Press Enter.

PowerShell should open directly inside the Orbit project directory.

Check by running:

```powershell
Get-Location
```

---

# PART 4 — Install Orbit's packages

## 6. Install dependencies

Run:

```powershell
npm install
```

Wait until npm finishes.

Then run:

```powershell
npm run typecheck
```

If typecheck succeeds without TypeScript errors, continue.

---

# PART 5 — Sign Wrangler into Cloudflare

## 7. Authenticate Wrangler

Run:

```powershell
npx wrangler login --use-keyring
```

A browser window should open.

1. Log into Cloudflare if asked.
2. Authorize Wrangler.
3. Return to PowerShell.

The `--use-keyring` option lets Wrangler use Windows Credential Manager for its OAuth credential storage.

Verify the login:

```powershell
npx wrangler whoami
```

Confirm the displayed Cloudflare account is the account where Orbit should live.

---

# PART 6 — Discord Developer Portal

## 8. Open your Orbit Discord application

1. Open the Discord Developer Portal.
2. Select the application used by Orbit.

Do not create a new Discord app if Orbit already has one.

## 9. Record the Discord Client ID

1. Open **General Information**.
2. Find **Application ID**.
3. Copy it somewhere temporarily.
4. This becomes:

```text
DISCORD_CLIENT_ID
```

Do not post it publicly unnecessarily, although the application ID itself is not the bot token.

## 10. Record the Discord Public Key

On **General Information**:

1. Find **Public Key**.
2. Copy it.
3. This becomes:

```text
DISCORD_PUBLIC_KEY
```

## 11. Get the Discord Client Secret

1. Open **OAuth2**.
2. Find the Client Secret area.
3. Copy your existing client secret if Discord allows it.
4. If Discord requires you to reset the secret, understand that the old secret will stop working.
5. Store the new value securely.
6. This becomes:

```text
DISCORD_CLIENT_SECRET
```

## 12. Get the Discord Bot Token

1. Open **Bot**.
2. Find the Token area.
3. Use your current bot token if you already have it securely saved.
4. Only reset the token if you actually need to.
5. If you reset it, any old deployment using the old token stops connecting immediately.
6. Store the token securely.
7. This becomes:

```text
DISCORD_BOT_TOKEN
```

Never paste the bot token into Discord, GitHub, a public support channel, `wrangler.jsonc`, or frontend JavaScript.

## 13. Enable required Discord Gateway intents

Still under **Bot**, find **Privileged Gateway Intents**.

Enable:

- **Server Members Intent**
- **Message Content Intent**

Save changes if Discord shows a Save button.

These are required for features such as member joins, leveling, Honeypot/message handling, Shield Mode signals, and community behavior that depends on normal server events.

## 14. Configure the OAuth redirect URL

You need your final Orbit URL. If your current production URL is already:

```text
https://orbitbot.oneeyednerdy.workers.dev
```

keep using it unless you intentionally changed domains.

In Discord Developer Portal:

1. Open **OAuth2**.
2. Find **Redirects**.
3. Add exactly:

```text
https://YOUR-ORBIT-HOSTNAME/oauth/callback
```

Example:

```text
https://orbitbot.oneeyednerdy.workers.dev/oauth/callback
```

4. Do not add a trailing slash after `callback`.
5. Save changes.

## 15. Configure Discord Interactions Endpoint URL

Find **Interactions Endpoint URL** in your Discord application settings.

Set it to:

```text
https://YOUR-ORBIT-HOSTNAME/interactions
```

Example:

```text
https://orbitbot.oneeyednerdy.workers.dev/interactions
```

Save it.

Discord will validate the endpoint. If it cannot validate yet because the new Worker is not deployed, return to this step immediately after deployment.

---

# PART 7 — Cloudflare Turnstile

## 16. Open your existing Turnstile widget

In Cloudflare Dashboard:

1. Open **Turnstile**.
2. Select the widget used by Orbit.

If you already created one for the previous Orbit release, keep it.

## 17. Confirm widget mode

Use **Managed** mode unless you have a specific reason to use another mode.

## 18. Confirm allowed hostname

Make sure the Orbit production hostname is allowed.

Example:

```text
orbitbot.oneeyednerdy.workers.dev
```

Do not include `https://` in the hostname list unless Cloudflare's UI specifically asks for a URL rather than a hostname.

## 19. Copy the Turnstile Site Key

Copy the **Site Key**.

This is public configuration and goes into `wrangler.jsonc` as:

```text
TURNSTILE_SITE_KEY
```

## 20. Copy the Turnstile Secret Key

Copy the **Secret Key**.

This becomes the production secret:

```text
TURNSTILE_SECRET_KEY
```

Never put the Turnstile secret in `public/`, browser JavaScript, or Git.

---

# PART 8 — Configure wrangler.jsonc

## 21. Open wrangler.jsonc

Open `wrangler.jsonc` in VS Code, Notepad++, or another plain-text editor.

Do not use Microsoft Word.

You will see a D1 section similar to:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "nerdspace-orbitbot",
    "database_id": "PASTE-YOUR-D1-DATABASE-ID-HERE",
    "migrations_dir": "migrations"
  }
]
```

---

# PATH A — EXISTING ORBIT DATABASE

## 22A. Find the existing D1 database

Run:

```powershell
npx wrangler d1 list
```

Find the existing Orbit database, normally named:

```text
nerdspace-orbitbot
```

Copy its database UUID.

**Do not run `d1 create` if this database already exists.**

## 23A. Put the existing database ID into wrangler.jsonc

Replace:

```text
PASTE-YOUR-D1-DATABASE-ID-HERE
```

with the existing D1 UUID.

Leave:

```jsonc
"binding": "DB"
```

and normally leave:

```jsonc
"database_name": "nerdspace-orbitbot"
```

unchanged.

---

# PATH B — BRAND-NEW ORBIT DATABASE

## 22B. Create D1 only if Orbit has never had one

Run:

```powershell
npx wrangler d1 create nerdspace-orbitbot
```

Wrangler returns information including a database ID.

Copy the UUID.

## 23B. Put the new ID into wrangler.jsonc

Replace:

```text
PASTE-YOUR-D1-DATABASE-ID-HERE
```

with that UUID.

---

# PART 9 — Set Orbit's public values

## 24. Set APP_ORIGIN

Inside `wrangler.jsonc`, find:

```jsonc
"APP_ORIGIN": "https://orbitbot.oneeyednerdy.workers.dev"
```

Set it to the exact Orbit production origin you are using.

Rules:

- Include `https://`.
- Do not add a trailing slash.
- It must match the URL used in Discord OAuth.

Example:

```jsonc
"APP_ORIGIN": "https://orbitbot.oneeyednerdy.workers.dev"
```

## 25. Set TURNSTILE_SITE_KEY

Replace:

```text
REPLACE_WITH_PRODUCTION_SITE_KEY
```

with the Turnstile Site Key copied earlier.

## 26. Set TURNSTILE_HOSTNAMES

Set this to the hostname only.

Example:

```jsonc
"TURNSTILE_HOSTNAMES": "orbitbot.oneeyednerdy.workers.dev"
```

If you later use a custom domain, update this value and the Turnstile widget hostname allowlist.

Save `wrangler.jsonc`.

---

# PART 10 — Create or confirm the Cloudflare Queue

## 27. Check for an existing queue

Run:

```powershell
npx wrangler queues list
```

Look for:

```text
orbit-jobs
```

## 28. Create the queue only if it does not exist

If `orbit-jobs` does not exist, run:

```powershell
npx wrangler queues create orbit-jobs
```

If Cloudflare tells you the queue already exists, that is fine; do not keep trying to recreate it.

Orbit uses this queue for scheduled work and publishing jobs.

---

# PART 11 — Create secure Orbit secrets

## 29. Generate SESSION_SECRET

Do not invent a short password.

In PowerShell run:

```powershell
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Copy the resulting random string.

This becomes:

```text
SESSION_SECRET
```

Keep this value stable after deployment. Changing it invalidates existing encrypted Orbit sessions.

## 30. Generate SOCIAL_CREDENTIAL_KEY if using social publishing

Run the same PowerShell commands again to generate a different random value:

```powershell
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Use the new result as:

```text
SOCIAL_CREDENTIAL_KEY
```

Do not reuse `SESSION_SECRET`, the Discord bot token, or Turnstile secret.

---

# PART 12 — Check existing Cloudflare secrets

## 31. List existing secret names

Run:

```powershell
npx wrangler secret list
```

For normal Orbit operation, these six secret names must exist:

```text
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
DISCORD_BOT_TOKEN
DISCORD_PUBLIC_KEY
SESSION_SECRET
TURNSTILE_SECRET_KEY
```

Optional names are:

```text
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
YOUTUBE_API_KEY
SOCIAL_CREDENTIAL_KEY
```

The command shows names, not secret values.

---

# PART 13 — First-time secrets or missing required secrets

Because this build declares required secrets in `wrangler.jsonc`, the safest initial method is to deploy all missing required secrets together.

## 32. Create a temporary production secrets file

In the Orbit project folder, create a file named:

```text
.env.production
```

Put these lines in it:

```dotenv
DISCORD_CLIENT_ID=PASTE_APPLICATION_ID_HERE
DISCORD_CLIENT_SECRET=PASTE_CLIENT_SECRET_HERE
DISCORD_BOT_TOKEN=PASTE_BOT_TOKEN_HERE
DISCORD_PUBLIC_KEY=PASTE_PUBLIC_KEY_HERE
SESSION_SECRET=PASTE_RANDOM_SESSION_SECRET_HERE
TURNSTILE_SECRET_KEY=PASTE_TURNSTILE_SECRET_HERE
```

If you already have Twitch credentials, append:

```dotenv
TWITCH_CLIENT_ID=PASTE_TWITCH_CLIENT_ID_HERE
TWITCH_CLIENT_SECRET=PASTE_TWITCH_CLIENT_SECRET_HERE
```

If you have a YouTube API key:

```dotenv
YOUTUBE_API_KEY=PASTE_YOUTUBE_API_KEY_HERE
```

If you are enabling encrypted social credentials:

```dotenv
SOCIAL_CREDENTIAL_KEY=PASTE_SEPARATE_RANDOM_KEY_HERE
```

### Security warning

Do not upload this file anywhere.

Do not commit it to Git.

Do not send it to anyone.

We will delete it after the secrets are safely uploaded to Cloudflare.

---

# PART 14 — Apply the D1 migrations

## 33. See what migrations Cloudflare thinks are pending

Run:

```powershell
npx wrangler d1 migrations list nerdspace-orbitbot --remote
```

For a fresh database, you should see the migration chain beginning with `0001_initial.sql` and continuing through `0026_creator_safety.sql`.

For an upgraded database, only migrations that were not previously applied should appear.

## 34. Apply the migrations

Run:

```powershell
npm run db:remote
```

Wrangler may ask you to confirm.

Read the migration list and answer Yes if it is targeting the correct `nerdspace-orbitbot` database.

Do not close PowerShell while migrations are running.

Cloudflare D1 records applied migrations and only applies unapplied migration files in order.

## 35. Verify migrations

Run again:

```powershell
npx wrangler d1 migrations list nerdspace-orbitbot --remote
```

Ideally it should report no remaining unapplied migrations.

---

# PART 15 — Deploy Orbit

## 36A. If all required secrets already existed

If `npx wrangler secret list` showed all six required secret names, run:

```powershell
npm run deploy
```

## 36B. If this is the first deployment or required secrets were missing

Deploy the code and secrets together:

```powershell
npx wrangler deploy --secrets-file .env.production
```

This uploads the secrets without putting their values into `wrangler.jsonc`.

Wait for deployment to finish.

Wrangler should display the deployed Worker URL.

## 37. Delete the temporary secret file

After the deployment succeeds, immediately run:

```powershell
Remove-Item .env.production
```

Confirm it is gone:

```powershell
Test-Path .env.production
```

PowerShell should return:

```text
False
```

---

# PART 16 — Confirm Cloudflare resources after deploy

## 38. Open Cloudflare Workers & Pages

1. Open Cloudflare Dashboard.
2. Go to **Workers & Pages**.
3. Open the Worker named:

```text
orbitbot
```

## 39. Confirm D1 binding

In Worker settings/bindings, confirm a D1 binding exists:

```text
DB
```

and points to:

```text
nerdspace-orbitbot
```

## 40. Confirm Queue binding

Confirm the Worker has the queue binding:

```text
JOBS
```

pointing at:

```text
orbit-jobs
```

## 41. Confirm Durable Object binding

Confirm the Worker has:

```text
GATEWAY
```

for class:

```text
DiscordGateway
```

The first deployment provisions the Durable Object migration declared by this release.

## 42. Confirm cron trigger

Orbit's Wrangler config contains:

```text
* * * * *
```

This is a once-per-minute scheduled trigger.

Confirm the Worker shows a cron/scheduled trigger.

## 43. Confirm required secrets

Run locally:

```powershell
npx wrangler secret list
```

Confirm the six required names exist.

---

# PART 17 — Finish Discord URLs after deployment

If Discord rejected the Interactions URL earlier because Orbit was not online yet, do this now.

## 44. Confirm OAuth redirect again

Discord Developer Portal > OAuth2 > Redirects:

```text
https://YOUR-ORBIT-HOSTNAME/oauth/callback
```

## 45. Confirm Interactions Endpoint URL again

Set:

```text
https://YOUR-ORBIT-HOSTNAME/interactions
```

Discord should validate the endpoint.

If Discord says the endpoint is invalid, do not keep randomly changing settings. Check the deployed Worker logs and confirm `DISCORD_PUBLIC_KEY` is correct.

---

# PART 18 — Open Orbit for the first time

## 46. Visit Orbit

Open:

```text
https://YOUR-ORBIT-HOSTNAME
```

## 47. Sign into the dashboard

Click **Open Dashboard** or the Discord login action.

Discord should send you through OAuth and return you to Orbit.

Orbit's dashboard login requests Discord identity and guild list access, not your Discord password.

## 48. Check the server list

Orbit should show Discord servers where your authenticated Discord account can manage the server.

---

# PART 19 — Install or reinstall Orbit into your Discord server

## 49. Use Orbit's install button

Click:

```text
Add Orbit to Discord
```

or select a server where Orbit is not installed and use the install action.

## 50. Select the server

Discord will show servers where you have sufficient permission to install the app.

Select your **test server first**.

Do not start with your primary production community.

## 51. Review permissions

Orbit intentionally does not ask for Discord Administrator.

Review the requested granular permissions.

Approve the installation.

## 52. Check role hierarchy

Back in Discord:

1. Open **Server Settings**.
2. Open **Roles**.
3. Find the Orbit bot role.
4. Move Orbit above any role it must assign or remove.
5. Do not place Orbit above owner/admin roles unnecessarily.

If Orbit cannot assign `@Verified`, this hierarchy is the first thing to check.

---

# PART 20 — Start/test the Discord Gateway

## 53. Open Orbit Diagnostics or Settings

Select the test server in Orbit.

Open **Diagnostics** first.

The build also includes a `start-gateway` API action exposed through the dashboard/backend foundation.

## 54. Run Diagnostics

Use the dashboard's diagnostic scan.

Review every failed item before enabling automatic moderation.

Important checks include:

- Discord bot connection.
- Role hierarchy.
- Turnstile configuration.
- D1 access.
- Required bindings.
- Discord permissions.

---

# PART 21 — Configure Verification

## 55. Create Discord roles first

In Discord create or identify the roles you want Orbit to use, such as:

```text
Agreed to Rules
Verified
Community Access
```

These names are examples; Orbit stores Discord role IDs.

## 56. Put Orbit above those roles

Server Settings > Roles:

Move Orbit's bot role above those access roles.

## 57. Open Orbit > Community > Verification

Choose:

- Rules role.
- Verified role.
- Combined access role.
- Admin log channel.

Configure the notification checkboxes you want.

Click **Save Verification**.

## 58. Test Turnstile verification

Use a test Discord member account if possible.

Complete the Orbit verification flow.

Confirm:

1. Turnstile appears.
2. Turnstile succeeds.
3. Orbit recognizes the correct Discord identity.
4. Orbit grants the correct role.
5. The action appears in logs.

Do not enable verification as a hard gate for your entire production server until this succeeds.

---

# PART 22 — Configure Logs and Diagnostics

## 59. Pick a staff-only log channel

Create a Discord channel such as:

```text
#orbit-logs
```

Restrict it to appropriate staff roles.

## 60. Configure Orbit logging

Use Orbit's dashboard to choose the log/admin channel where supported.

## 61. Save a diagnostic report

Open **System > Diagnostics**.

Use **Run + Save Report**.

Resolve critical permission or hierarchy failures before moving on.

---

# PART 23 — Configure Honeypot safely

## 62. Create the honeypot channel

In Discord create a channel specifically for the Honeypot.

Make the purpose/warning clear enough for legitimate users if that is part of your server design.

## 63. Configure exempt roles before enabling Honeypot

In Orbit > Moderation > Honeypot:

Add all roles that must never be automatically punished, for example:

- Moderator.
- Admin-equivalent staff role.
- Trusted support staff.
- Test staff.

Orbit also protects the server owner/administrator conditions according to the module's safety rules.

## 64. Configure message cleanup

Enable the configured recent-message cleanup behavior if desired.

The roadmap build is designed around deleting the offender's stored recent message references rather than creating a searchable archive of message content.

## 65. Test with a throwaway account

Never test the first automatic ban using your main account or a production moderator.

Use a test server and a disposable test member.

Confirm:

- Honeypot detects the message.
- Exempt members are not punished.
- Non-exempt test member is handled.
- Recent cleanup occurs.
- The action is logged.

---

# PART 24 — Configure Shield Mode

## 66. Open Moderation > Shield Mode

Set the emergency profile before using automatic activation.

Choose:

- Channels Orbit may protect.
- Staff notification behavior.
- Join/spam thresholds available in the UI.
- Temporary restrictions.

## 67. Test Shield manually first

Activate Shield Mode manually in a test server.

Verify exactly what changes.

Then use the restore action and confirm Orbit reverses only the restrictions it owns.

Do not enable aggressive automatic raid response until the manual test behaves correctly.

---

# PART 25 — Configure Security Center / Lockdown

## 68. Run Security Center

Open **System > Security Center**.

Review findings for:

- Risky permissions.
- Role hierarchy.
- Overly broad access.
- Orbit permission requirements.

## 69. Test Incident Lockdown only in a test channel

Choose a throwaway channel.

Apply lockdown.

Confirm staff retain access.

Restore normal operation.

Only after successful testing should you configure production emergency channels.

---

# PART 26 — Configure Roles

## 70. Open Community > Roles

Use Orbit's role-panel builder.

Create one small test panel first.

For example:

```text
Choose your notification role
```

Use a button or dropdown connected to a harmless test role.

## 71. Post the panel

Choose a test Discord channel.

Create/post the panel.

## 72. Test as a normal member

Confirm the member receives only the configured role.

Confirm another role cannot be substituted by manipulating the interaction; the backend revalidates the stored configuration.

---

# PART 27 — Configure Tickets

## 73. Create support staff roles

Examples:

```text
Support Team
Moderators
Beta Team
```

## 74. Create Discord ticket parent categories if required by your workflow

Examples:

```text
SUPPORT TICKETS
BETA TICKETS
MOD REPORTS
```

## 75. Open Community > Tickets

Create ticket categories such as:

- General.
- Question.
- Beta Test Program.
- Bug Report.
- Member Report.

For each category, select its staff role/routing settings.

## 76. Test the ticket dropdown

Post a test ticket panel.

Use a normal member test account to open one ticket.

Test:

- Open.
- Claim.
- Add/remove user if available.
- Close.
- Transcript/log behavior.

---

# PART 28 — Configure Scheduled Posts

## 77. Open Automation > Scheduled Posts

Create one test post scheduled 2–3 minutes in the future.

Choose a harmless test channel.

## 78. Wait for the queue/cron

Do not leave the dashboard open as a requirement; scheduled work is designed to run through Cloudflare infrastructure.

Confirm the message posts at the expected time.

## 79. Test batch scheduling

After the single test works, queue several posts.

Confirm history/status changes correctly.

---

# PART 29 — Configure Leveling

## 80. Open Community > Leveling

Configure XP behavior conservatively first.

Use a test channel/server.

## 81. Test message XP

Send normal messages from a non-bot test member.

Confirm XP increases according to cooldown rules.

## 82. Add a harmless test level reward

Use a low-risk test role.

Confirm Orbit grants it only when the configured threshold is reached.

---

# PART 30 — Configure Automations

## 83. Open Automation > Automations

Create a simple non-destructive automation first.

Example:

```text
Trigger: member joins
Action: log event
```

Do not start with automatic bans/kicks.

## 84. Confirm the automation log

Join with a test member and confirm the trigger/action appears correctly.

---

# PART 31 — Configure Ko-fi milestones

## 85. Open Creator > Ko-fi

Create the integration using the dashboard's Ko-fi configuration.

Orbit's webhook design uses a per-server token whose usable token value is not stored as plain text in D1.

## 86. Copy the generated Orbit webhook URL

It will follow Orbit's Ko-fi webhook route pattern.

Put the generated URL into your Ko-fi webhook configuration.

Do not invent the URL manually if Orbit provides it in the dashboard.

## 87. Create a test milestone

Use a low test threshold in a test configuration.

Verify the Discord announcement/action before using production milestones.

---

# PART 32 — Twitch Community Alerts

## 88. Create Twitch Developer credentials if you want Twitch live detection

Use Twitch's developer console to create/register an application appropriate for Orbit server-to-server API access.

Record:

```text
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
```

## 89. Add Twitch secrets to Cloudflare

If Orbit is already deployed, upload the two secrets.

A safe method is to create a temporary file containing only the values you are adding and run `wrangler secret bulk`, or use Cloudflare Dashboard > Worker > Settings > Variables and Secrets and add them as **Secret** values.

Do not put them in `wrangler.jsonc`.

## 90. Add a Community Alert

Orbit > Community > Community Alerts:

Choose:

- Platform: Twitch.
- Creator label.
- Twitch login name.
- Discord destination channel.
- Optional ping role.
- Going-live message.
- Offline message.
- Whether to post when the stream ends.

Available message variables include:

```text
{creator}
{title}
{url}
{vod_url}
```

## 91. Test with one creator

Use one Twitch creator first.

Confirm Orbit detects the live state and does not duplicate the same stream event repeatedly.

---

# PART 33 — YouTube Community Alerts

## 92. Get a YouTube Data API key

In Google Cloud Console:

1. Create/select the project you want to use.
2. Enable the YouTube Data API needed for the live search used by Orbit.
3. Create an API key.
4. Restrict the key appropriately for server-side use where possible.

## 93. Store YOUTUBE_API_KEY as a Cloudflare secret

Use Cloudflare Worker secrets, not `wrangler.jsonc`.

## 94. Add a YouTube Community Alert

Use the creator's **YouTube channel ID**, not merely the display name.

Select the Discord destination channel and custom messages.

Test with one channel before adding many.

---

# PART 34 — RSS Alerts

## 95. Add RSS without API credentials

Community Alerts supports RSS sources without Twitch/YouTube secrets.

Enter:

- Label.
- RSS feed URL.
- Discord channel.
- Notification formatting.

Test with a known feed.

---

# PART 35 — Social publishing encryption

## 96. Ensure SOCIAL_CREDENTIAL_KEY exists before storing platform credentials

Run:

```powershell
npx wrangler secret list
```

If `SOCIAL_CREDENTIAL_KEY` is absent and you plan to configure supported social adapters, add it as a Cloudflare secret first.

This key should remain stable. Changing it can make previously encrypted stored integration credentials unreadable.

## 97. Configure supported adapters in Orbit

Use Creator/Social Publishing in the dashboard for the currently implemented adapters.

Do not expect an unsupported platform to silently succeed; Orbit is designed to fail closed when an adapter is not implemented/configured.

---

# PART 36 — Creator Directory

## 98. Open Creator > Creator Directory

Add approved creators with:

- Display name.
- Discord user ID where applicable.
- Twitch name.
- YouTube channel ID.
- Bio.

Start with a test creator.

---

# PART 37 — Events

## 99. Test Discord Scheduled Event creation

Orbit's install permission set includes Discord's event-related permission required by the current build.

If Orbit was installed before this release, use **Add Orbit to Discord** again to reauthorize the newer permission set.

Create one test event from the dashboard and verify it appears correctly in Discord.

---

# PART 38 — Applications and Appeals

## 100. Open Community/System application tools

Configure one test form/application type first.

Examples:

- Beta Test Program.
- Moderator application.
- Creator application.
- Appeal.

Use non-sensitive dummy information in your first test.

Confirm staff can review the submission and its status.

---

# PART 39 — Community Health

## 101. Run Community Health only as analysis first

Review its role/channel/community findings.

Do not perform broad cleanups solely because something appears inactive.

Use the information to make a deliberate admin decision.

---

# PART 40 — Creator Safety Mode

## 102. Configure safety actions on test channels

Use throwaway/test channels first.

Make sure staff access remains intact.

Test both activation and restoration.

---

# PART 41 — Operations Center

## 103. Open Overview / Operations Center

Once modules have data, verify the dashboard summarizes items such as:

- Open tickets.
- Queued scheduled posts.
- Creators currently detected live.
- Recent moderation activity.
- Upcoming events.
- Pending applications.
- Shield/security status.

This page is operational visibility; module configuration stays in the relevant module pages.

---

# PART 42 — Production hardening in Cloudflare

## 104. Add WAF/rate-limit protections at the Cloudflare edge

Protect sensitive paths such as:

```text
/oauth/*
/verify/*
/api/*
/interactions
/webhooks/*
```

Do not create rules that block Discord, Twitch, Ko-fi, or other legitimate service requests without testing them.

## 105. Never expose secrets

Secrets belong in Cloudflare Worker secrets.

Never store production secrets in:

```text
public/
GitHub
Discord messages
wrangler.jsonc
frontend JavaScript
D1 plaintext configuration
```

## 106. Keep Administrator off Orbit unless a future design explicitly requires it

Orbit is designed around granular Discord permissions.

Do not manually grant Administrator just to make a permission error disappear.

Fix the actual role hierarchy or missing granular permission instead.

---

# PART 43 — Basic production test checklist

Before calling the deployment ready, verify all of these on a test server:

- [ ] Dashboard login works.
- [ ] Server list loads.
- [ ] Orbit install/reinstall works.
- [ ] Diagnostics run.
- [ ] D1 reads/writes work.
- [ ] Gateway-based member/message features operate.
- [ ] Verification succeeds.
- [ ] Wrong/failed Turnstile does not grant roles.
- [ ] Role hierarchy errors are explained.
- [ ] Role panel grants only the configured role.
- [ ] Ticket opens and closes.
- [ ] Scheduled post actually publishes through queue/cron.
- [ ] Leveling records activity.
- [ ] Honeypot respects exempt roles.
- [ ] Honeypot punishment works on a disposable test member.
- [ ] Shield activates and restores correctly.
- [ ] Incident Lockdown activates and restores correctly.
- [ ] Security Center reports findings.
- [ ] Ko-fi webhook works if configured.
- [ ] Twitch alert works if configured.
- [ ] YouTube alert works if configured.
- [ ] RSS alert works if configured.
- [ ] Discord Scheduled Event creation works.
- [ ] Creator Safety Mode restores properly.
- [ ] Operations Center metrics update.

---

# PART 44 — Updating Orbit later

Future cumulative releases should follow this pattern:

1. Back up/save the current project ZIP.
2. Download the newer cumulative Orbit ZIP.
3. Copy your production resource IDs/configuration carefully into the new `wrangler.jsonc` where required.
4. Do **not** create a new D1 database.
5. Run:

```powershell
npm install
```

6. Run:

```powershell
npm run typecheck
```

7. Check pending migrations:

```powershell
npx wrangler d1 migrations list nerdspace-orbitbot --remote
```

8. Apply migrations:

```powershell
npm run db:remote
```

9. Deploy:

```powershell
npm run deploy
```

D1 records migration history, so only unapplied migrations run.

---

# PART 45 — Useful troubleshooting commands

## Confirm Cloudflare login

```powershell
npx wrangler whoami
```

## Confirm D1 databases

```powershell
npx wrangler d1 list
```

## Confirm pending D1 migrations

```powershell
npx wrangler d1 migrations list nerdspace-orbitbot --remote
```

## Apply remote migrations

```powershell
npm run db:remote
```

## List queues

```powershell
npx wrangler queues list
```

## List secret names

```powershell
npx wrangler secret list
```

## Run TypeScript validation

```powershell
npm run typecheck
```

## Deploy

```powershell
npm run deploy
```

## Watch production Worker logs

```powershell
npx wrangler tail
```

Use `wrangler tail` while reproducing a problem. Never paste logs publicly until you have checked that they do not contain data you do not want to share.

---

# PART 46 — If something goes wrong

Do not recreate everything immediately.

Use this order:

1. Run Orbit Diagnostics.
2. Check Discord role hierarchy.
3. Check the bot's granular Discord permissions.
4. Run `npx wrangler secret list` and confirm required secret names exist.
5. Run `npx wrangler d1 migrations list nerdspace-orbitbot --remote`.
6. Run `npx wrangler queues list`.
7. Run `npx wrangler tail`.
8. Reproduce the problem once.
9. Copy the specific error message, excluding secrets/tokens.

Never reset the Discord bot token, delete D1, or delete the Worker as a first troubleshooting step.

---

# Final rule

Build out and enable Orbit **one module at a time on a test Discord server**. Once a module passes its test, configure it on the production community. That keeps an error in a new moderation, automation, or permission rule from affecting the whole server at once.
