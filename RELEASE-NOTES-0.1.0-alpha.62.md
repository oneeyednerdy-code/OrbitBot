# Orbit v0.1.0-alpha.62 — Owner My Stream Alerts

Alpha.62 adds a dedicated server-owner stream alert workflow inside Community Alerts.

## Included

- A **My Stream** section visible only to the Discord server owner.
- Twitch OAuth authorization scoped to the owner-stream flow.
- Encrypted storage of the Twitch authorization and channel login.
- Destination Discord channel selection.
- Optional Mentionable role ping with Orbit’s existing role-hierarchy repair.
- Editable live message with `{creator}`, `{title}`, and `{url}` variables.
- Configurable 5–60 minute polling interval.
- Duplicate-safe notifications using the Twitch stream ID.
- Enable, disable, reconnect, and delete controls.
- Existing Community Streamers and manual creator alerts remain separate.

## Upgrade

Apply the cumulative migration chain through `0046_owner_stream_alerts.sql`, deploy the Worker, and ensure `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and `SOCIAL_CREDENTIAL_KEY` are configured. The server owner then opens **Community Alerts → My Stream** and chooses **Connect / Reconnect Twitch**.
