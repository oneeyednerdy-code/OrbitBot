# Orbit v0.1.0-alpha.62 — Deploy Me First

This ZIP is the **single cumulative Orbit deployment**. You do not install older builds separately. The `migrations/` directory contains the full ordered D1 migration chain through alpha.62. Apply all pending migrations through `0046_owner_stream_alerts.sql` before deploying the Worker. Alpha.62 adds server-owner-only My Stream Twitch authorization and duplicate-safe live alerts while retaining the `orbit-storage` R2 upload binding and guarded editing for existing Discord categories and channels.

## 1. Prerequisites

You need:

- Node.js 20+
- A Cloudflare account
- Wrangler authenticated with Cloudflare
- A Discord application/bot
- A Cloudflare Turnstile widget (already used by Orbit verification)

Optional integrations need their own credentials:

- Twitch: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`
- YouTube live detection: `YOUTUBE_API_KEY`
- Social publishing: `SOCIAL_CREDENTIAL_KEY` plus credentials entered through Orbit for Bluesky/Mastodon/Threads
- YouTube publishing: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` (Orbit requests `youtube.upload`)
- TikTok publishing/relay: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` (TikTok app approval for `video.list` and `video.publish` is required)
- Instagram Reels publishing: `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET` (Instagram professional account and Meta approval for `instagram_business_content_publish` are required)

Direct Short-Form Video file uploads use the `orbit-storage` R2 bucket through the `orbit_storage` Worker binding. URL-only video posts continue to work without this binding.

## 2. Discord Developer Portal

In your Discord bot settings enable the Gateway intents Orbit currently uses:

- Server Members Intent
- Message Content Intent

Orbit deliberately does **not** request Administrator. The generated install URL requests granular permissions for roles, moderation, channel protection, message cleanup, and Create Events.

Set the OAuth redirect URI to:

`https://YOUR-ORBIT-DOMAIN/oauth/callback`

Set the Interactions Endpoint URL to:

`https://YOUR-ORBIT-DOMAIN/interactions`

## 3. Install dependencies

```bash
npm install
```

## 4. Create the D1 database

```bash
npx wrangler d1 create nerdspace-orbitbot
```

Copy the returned database ID into `wrangler.jsonc`:

```jsonc
"database_id": "YOUR-REAL-D1-ID"
```

If you are upgrading an existing Orbit deployment, **keep the existing D1 database ID**.

## 5. Create the queue

```bash
npx wrangler queues create orbit-jobs
```

The queue is used for scheduled posts and social publishing jobs.

## 6. Update the public URL

Edit `wrangler.jsonc`:

- `APP_ORIGIN`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_HOSTNAMES`

Use your production Orbit hostname. Do not leave the placeholder Turnstile site key.

## 7. Add required secrets

Run each command and paste the secret when prompted:

```bash
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
```

`SESSION_SECRET` should be a long random secret and must remain stable. Changing it invalidates encrypted sessions.

Optional creator integrations:

```bash
npx wrangler secret put TWITCH_CLIENT_ID
npx wrangler secret put TWITCH_CLIENT_SECRET
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler secret put SOCIAL_CREDENTIAL_KEY
npx wrangler secret put YOUTUBE_CLIENT_ID
npx wrangler secret put YOUTUBE_CLIENT_SECRET
npx wrangler secret put TIKTOK_CLIENT_KEY
npx wrangler secret put TIKTOK_CLIENT_SECRET
npx wrangler secret put INSTAGRAM_CLIENT_ID
npx wrangler secret put INSTAGRAM_CLIENT_SECRET
```

For **My Stream**, configure `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and `SOCIAL_CREDENTIAL_KEY`. In the Twitch developer console, use this callback URL:

`https://YOUR-ORBIT-DOMAIN/connections/twitch/callback`

The server owner then connects Twitch from **Community Alerts → My Stream**. Orbit stores the authorization encrypted and only exposes that owner-linked Twitch account to the owner’s server configuration.

Use a separate high-entropy `SOCIAL_CREDENTIAL_KEY`. Do not reuse the Discord bot token or Turnstile secret.

## 8. Apply D1 migrations

Existing production database:

```bash
npm run db:remote
```

For a local test database:

```bash
npm run db:local
```

The complete release contains 46 ordered migrations. Do not manually skip migration files.

## 8a. Enable direct video uploads (optional)

Create an R2 bucket and bind it to the Worker:

```bash
npx wrangler r2 bucket create orbit-storage
```

The included `wrangler.jsonc` already contains `"r2_buckets": [{ "binding": "orbit_storage", "bucket_name": "orbit-storage" }]`. Redeploy Orbit after confirming the bucket exists. The Short-Form Video page will then show the file picker; without the binding, the public HTTPS URL fallback remains available.

## 8b. Provider callback URLs and publishing setup

Register these exact callback URLs with the provider apps:

- YouTube: `https://YOUR-ORBIT-DOMAIN/connections/youtube/callback`
- TikTok: `https://YOUR-ORBIT-DOMAIN/connections/tiktok/callback`
- Instagram: `https://YOUR-ORBIT-DOMAIN/connections/instagram/callback`

Under **Connections**, authorize the account before opening **Social** or **Short-Form Video**. TikTok and Instagram publishing may remain restricted until the provider approves the requested product/scopes. Short-Form Video accepts a direct MP4/MOV/WebM file when `orbit_storage` is configured, or a public HTTPS media URL as a fallback. Orbit serves uploaded media over a random public HTTPS route so TikTok and Instagram can retrieve it; YouTube is uploaded to its resumable upload endpoint by Orbit.

## 9. Deploy

```bash
npm run deploy
```

Cloudflare creates the Durable Object class migration during deployment. The cron runs once per minute and asks the single Discord Gateway Durable Object to remain active while also dispatching scheduled work and creator alerts. Alpha.36 makes this start request idempotent and safe: it does not create another connection while one is connecting/open, and terminal Gateway failures halt instead of looping.

## 10. Install/reinstall Orbit in Discord

Open the deployed Orbit site and choose **Add Orbit to Discord**. Reinstall/reauthorize Orbit on an existing server if Discord needs to grant permissions introduced by later features, especially **Create Events**.

## 11. First production checks

Use a test server before your primary community.

1. Open Diagnostics and run a scan.
2. Verify role hierarchy.
3. Test Turnstile verification.
4. Start/test the Discord Gateway from Settings/Diagnostics if needed.
5. Configure Honeypot exemptions before enabling it.
6. Configure Shield Mode but activate it manually for the first test.
7. Create a test ticket.
8. Queue a test scheduled post 2–3 minutes in the future.
9. Add one Community Alert creator.
10. Run Security Center and review permission findings.
11. Test Creator Safety Mode on a throwaway channel.
12. Test Incident Lockdown on a throwaway channel and restore it.

## 12. Cloudflare production hardening

At the Cloudflare zone/account layer, enable appropriate WAF and rate-limit protections for `/oauth/*`, `/verify/*`, `/api/*`, `/interactions`, and webhook endpoints. Keep all secrets in Wrangler/Cloudflare secrets; never place them in D1, `public/`, JavaScript, or Git.

## Upgrade rule

From this release forward, deploy the latest cumulative ZIP and run `npm run db:remote`. Wrangler/D1 applies only migrations that have not already run.
