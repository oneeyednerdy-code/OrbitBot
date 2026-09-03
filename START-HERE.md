# Start Here — Orbit v0.1.0-alpha.49

Orbit alpha.49 is a cumulative deployable build. You do **not** deploy the older patches one-by-one.

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

## Alpha.45 ticket panels

Run `npm run db:remote` before deployment to apply `0033_ticket_interaction_jobs.sql`. Open **Tickets**, create at least one category, then choose either **Direct ticket button** or **Category dropdown** when posting the panel. Direct mode opens the selected category immediately or presents its questions first.

Ticket channel creation uses the existing `JOBS` queue binding so Discord receives an immediate interaction acknowledgement. No new secret, OAuth scope, or Discord permission is required.

## Alpha.46 ticket resolution and category editing

Run `npm run db:remote` before deployment to apply `0034_ticket_resolution_reasons.sql`. Ticket opening messages now include **Close Ticket** and **Delete Ticket (Staff)**. Both actions require a reason. Close locks the opener from replying but keeps the channel and history; Delete requires configured ticket staff, Manage Channels, or Administrator and removes the Discord channel while preserving the reason in Orbit.

Existing categories can be loaded into the Tickets editor and updated in place, including their name, description, emoji, order, parent, enabled state, staff roles, and questions. Repost category-dropdown panels after editing visible category details because Discord does not automatically rewrite an already-posted menu. Updated questions apply automatically because the category ID stays the same.

## Alpha.47 owner-only Channel Manager

Run `npm run db:remote` to apply the migrations through `0036_security_reliability_hardening.sql`, then deploy. Only the Discord server owner sees and can call Channel Manager. Use it to bulk-create categories/channels, preview dependency-aware bulk deletions, create named structural backups, and queue restores.

Deleting a Discord channel permanently deletes its messages, threads, attachments and webhooks. Orbit snapshots structure before every operation, but those backups cannot restore content or original Discord channel IDs. Move or disable every blocked Orbit dependency before deletion, review the expanded target list, and type the exact confirmation phrase.

## Alpha.48 hierarchy ordering and safer sends

Channel Manager now supports dragging existing categories and channels into order, moving channels between categories, and arranging Bulk Create previews. Use the arrow controls when dragging is unavailable. Every Discord-changing action requires both the exact confirmation phrase and its acknowledgement checkbox, and only one Channel Manager job may run per server at a time.

Dashboard navigation paints a loading animation immediately. Scheduled Posts also displays progress and locks its button before starting the network request.

## Alpha.49 security and reliability hardening

Apply `0036_security_reliability_hardening.sql` before deploying. Alpha.49 validates every high-risk channel and role ID against the managed Discord server, defaults regular Discord sends to no mention parsing, gives queued work recoverable leases, retains failed protection snapshots, refreshes Discord dashboard sessions, and preserves scheduled local time across DST.
