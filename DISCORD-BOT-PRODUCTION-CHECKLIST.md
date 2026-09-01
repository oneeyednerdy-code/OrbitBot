# Discord bot production checklist

Use this checklist before every Orbit deployment.

## Gateway

- Exactly one named Gateway Durable Object is active.
- Runtime reaches `ready`; it is not halted or repeatedly backing off.
- IDENTIFY budget is comfortably above Orbit's protected floor.
- Required privileged intents are enabled; unused intents remain disabled.
- A replacement bot token is installed only after safe Gateway code is deployed.

## REST and interactions

- Discord 429 responses include a retry window in verbose diagnostics or job state.
- Repeated 401/403/429 responses are investigated rather than blindly retried.
- The Interactions Endpoint URL validates successfully in the Developer Portal.
- `DISCORD_PUBLIC_KEY` is current and interaction signatures pass.
- Commands/components respond within Discord's initial response window; slow work belongs on the queue.

## Permissions

- Orbit is not granted Administrator.
- The Orbit role is above every role it must assign or remove.
- Enabled modules have only their required permissions.
- Diagnostics passes after permissions, channels, or role hierarchy change.

## Security and operations

- Bot/OAuth tokens exist only in Cloudflare secrets.
- Production OAuth redirect URIs and Turnstile hostnames are exact.
- Verbose logs redact tokens, cookies, credentials, message content, and authorization headers.
- WAF/rate limits protect OAuth, verification, API, interaction, and webhook endpoints.
- A private test server passes verification, role panels, tickets, scheduled posts, events, Shield restore, and reconnect testing before production rollout.
