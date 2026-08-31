# alpha.31 setup additions

This release is cumulative. Existing alpha.30 installs keep the same D1 database.

## 1. Apply new migrations

```powershell
npx wrangler d1 migrations apply DB --remote
```

This applies `0027_adaptive_onboarding.sql` and `0028_diagnostics_bug_reports.sql` if they have not already been applied.

## 2. Set the Orbit operator account

Open `wrangler.jsonc` and set:

```jsonc
"ORBIT_OPERATOR_USER_IDS": "YOUR_DISCORD_USER_ID"
```

For more than one operator:

```jsonc
"ORBIT_OPERATOR_USER_IDS": "111111111111111111,222222222222222222"
```

This controls access to the cross-server Developer Bug Inbox. It does not grant Discord permissions.

## 3. Create the social credential encryption key

If `SOCIAL_CREDENTIAL_KEY` is not already configured, generate a long random value and store it as a Worker secret:

```powershell
npx wrangler secret put SOCIAL_CREDENTIAL_KEY
```

Do not place this key in browser JavaScript or commit it to Git.

## 4. Twitch OAuth for one-click Connect Twitch

Create/configure your Twitch Developer application and add this OAuth redirect URL:

```text
https://YOUR-ORBIT-DOMAIN/connections/twitch/callback
```

Then set:

```powershell
npx wrangler secret put TWITCH_CLIENT_ID
npx wrangler secret put TWITCH_CLIENT_SECRET
```

The normal Orbit user only clicks **Connect Twitch** and authorizes Twitch. They do not see these credentials.

## 5. YouTube OAuth for one-click Connect YouTube

Create a Google OAuth web application with YouTube Data API access and add:

```text
https://YOUR-ORBIT-DOMAIN/connections/youtube/callback
```

Then set:

```powershell
npx wrangler secret put YOUTUBE_CLIENT_ID
npx wrangler secret put YOUTUBE_CLIENT_SECRET
```

The connected Google account grants the YouTube readonly scope used to identify the channel.

## 6. Deploy

```powershell
npm install
npm run typecheck
npx wrangler deploy
```

## 7. First alpha.31 dashboard test

1. Sign into Orbit with Discord.
2. Select a manageable Discord server.
3. Orbit should open the **What do you want Orbit to help with?** screen if that server has not completed adaptive onboarding.
4. Select only one feature, such as **Creator Alerts**, and continue.
5. Confirm the sidebar is trimmed to that feature plus core settings.
6. Open **Add More Features**, enable another family, save, and confirm its navigation appears.
7. Open **Connections** and test Twitch/YouTube only if their operator credentials are configured.
8. Expand **Diagnostics** at the bottom of the dashboard.
9. Run a full check, copy a report, and download a log.
10. Click **Report a Bug**, submit a test report, and note the returned `ORB-...` ID.
11. Sign in with the Discord account listed in `ORBIT_OPERATOR_USER_IDS` and open **Developer Bug Inbox**.
12. Confirm the test report appears and can be moved from `new` to `triaged` or another status.

## Privacy rule
Orbit bug reports are intended for application troubleshooting. The client sends only recent sanitized error/network metadata selected by the reporter. The server performs another sanitization pass before storage. OAuth credentials and Worker secrets are not returned by the connection APIs.
