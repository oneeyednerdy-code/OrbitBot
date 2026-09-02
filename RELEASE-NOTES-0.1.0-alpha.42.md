# Orbit v0.1.0-alpha.42 — Role-Gated Community Alerts

Alpha.42 adds automatic Twitch and YouTube live announcements for approved community creators who hold a selected Discord role.

## Dashboard workflow

1. Add each creator to **Creator Directory** with their Discord user ID and Twitch name and/or YouTube channel ID.
2. Open **Community Alerts** and enable **Role-gated live alerts**.
3. Select the role that makes a member eligible and the Discord channel where live alerts should be posted.
4. Optionally choose a separate mentionable role to ping and customize the alert template.

The eligibility role itself is never pinged unless it is also explicitly selected as the optional ping role. Orbit checks only the member IDs listed in Creator Directory, so this automation does not enumerate all guild members.

## Delivery behavior

- Twitch and YouTube are checked every 5–60 minutes, as configured.
- A live session is posted once when the state changes from offline to live.
- Removing the required role prevents future announcements. If the member regains the role while live, the next eligible check can announce the stream.
- Delivery and provider failures appear beside the creator in Community Alerts.
- Existing manual Twitch, YouTube, and RSS alerts continue to work unchanged.
- Twitch app tokens are cached until expiry. YouTube uses the public channel feed plus the low-cost video-details endpoint instead of a high-cost search request for every check.

## Deployment

Apply migration `0032_role_gated_community_alerts.sql` before deploying:

```bash
npm run db:remote
npm run deploy
```

Twitch requires `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`. YouTube live detection requires `YOUTUBE_API_KEY`.
