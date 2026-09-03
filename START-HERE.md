# Start Here — Orbit v0.1.0-alpha.44

Orbit alpha.44 is a cumulative deployable build. You do **not** deploy the older patches one-by-one.

For a brand-new deployment, follow `DEPLOYMENT-GUIDE-WINDOWS-DETAILED.md` first, then `ALPHA31-SETUP.md` for the adaptive onboarding, social connection, diagnostics, and bug-report settings introduced in alpha.31. Alpha.32 requires no new secrets or migrations.

For an existing alpha.30 deployment, keep your current D1 database and Cloudflare resources. Follow `ALPHA31-SETUP.md`, apply pending migrations, add any new optional secrets you want, and deploy.
## Alpha.34 additions

Before testing social authorization, read `ALPHA34-SETUP.md`. Alpha.34 adds migration `0029_social_auth_verbose_errors.sql`; run `npm run db:remote` before deploying the Worker.

After deployment, test Discord Events, Role Panels, Applications/Appeals, Connections, and the verbose Logs page on a private server.



## Alpha.35 note
If the dashboard previously showed `Could not load this server (forbidden)`, alpha.35 now identifies whether Discord authorization must be reconnected, Discord is rate limiting the request, the server is unavailable to the account, or Manage Server permission is actually missing.


## Alpha.36 emergency Gateway recovery
If Discord reset OrbitBot’s token because of excessive Gateway connections, **deploy alpha.36 before generating/setting the replacement token**. Then follow `ALPHA36-RECOVERY.md`. The new Gateway implementation preflights `/gateway/bot`, resumes existing sessions instead of repeatedly identifying, halts on terminal close codes, and protects the remaining IDENTIFY budget.

## Alpha.38 scheduler preview

The Scheduled Posts preview now preserves entered line breaks and blank lines. Its live counter includes the selected role mention in Discord's 2,000-character message limit. No migration, secret, OAuth scope, or Discord permission is added.

## Alpha.39 visible version

The login page and dashboard footer display the deployed Orbit build number so screenshots and bug reports can be matched to the correct package immediately.

## Alpha.40 Diagnostics/Logs recovery

Alpha.40 prevents a missing `orbit_error_log` table from crashing the entire Diagnostics and Logs routes. Orbit now identifies migration `0029_social_auth_verbose_errors.sql` as missing and directs the operator to run:

```bash
npm run db:remote
```

Applying the migration remains required to enable verbose server error history.

## Alpha.41 verification channel setup

Open **Verification** in the Orbit dashboard, save the Rules, Verified, and Combined roles, then choose the Discord verification channel and select **Post Verification Panel**. Do not post a permanent verification link. Each member clicks the panel button and receives a private link bound to their Discord account that expires after 15 minutes.

The Discord application must keep its Interactions Endpoint URL set to `https://YOUR-ORBIT-DOMAIN/interactions`.

## Alpha.42 role-gated Community Alerts

Run `npm run db:remote` before deploying to apply migration `0032_role_gated_community_alerts.sql`. In **Creator Directory**, add each creator's Discord user ID and Twitch name and/or YouTube channel ID. Then open **Community Alerts**, enable **Role-gated automation**, select the eligibility role and destination Discord channel, and save.

The selected eligibility role is checked silently and is not pinged. An optional separate ping role may be selected if that role is marked Mentionable in Discord. Twitch detection requires `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`; YouTube live detection requires `YOUTUBE_API_KEY`.

## Alpha.43 Tickets page guard

Tickets now ignores late API responses after you navigate to another page or server. No migration, secret, OAuth scope, or Discord permission is added by alpha.43.

## Alpha.44 common Role Panel templates

Open **Role Panels**, select Pronouns, Notification Pings, Interests, or Regions, and choose **Use Template**. Orbit matches existing roles by common names. If any are missing, you may explicitly enable **Create missing template roles in Discord** before posting. Orbit needs its existing Manage Roles permission and must remain above every self-assignable role.

Alpha.44 adds no migration, secret, OAuth scope, or Discord permission.
