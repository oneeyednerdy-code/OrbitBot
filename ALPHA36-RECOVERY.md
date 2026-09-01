# Orbit alpha.36 — Discord bot-token recovery

Use this guide if Discord sent an official notice that OrbitBot exceeded the Gateway IDENTIFY/login limit and Discord reset the bot token.

## Why alpha.36 must be deployed first
The alpha.35 Gateway reconnect code could create a reconnect storm because it:

- scheduled reconnects from both WebSocket `error` and `close`,
- retried every 5 seconds without exponential backoff,
- sent a fresh `IDENTIFY` on every connection instead of using `RESUME`, and
- did not stop on terminal close codes such as invalid token or disallowed intents.

Alpha.36 replaces that loop. Do not put a fresh token into an older Orbit build.

## Safe recovery order

1. Leave the currently-reset/invalid token in Cloudflare for the moment.
2. Deploy alpha.36.
3. Open Discord Developer Portal → OrbitBot → Bot.
4. Reset/copy the new bot token. Keep it private.
5. In the Orbit project directory run:

```bash
npx wrangler secret put DISCORD_BOT_TOKEN
```

6. Paste the new token only into Wrangler's secret prompt.
7. Deploy once more so the deployment and secret are known-good:

```bash
npm run deploy
```

8. Open Orbit → Diagnostics.
9. Confirm **Discord API**, **Gateway runtime**, and **Gateway IDENTIFY budget** are healthy.

Never paste the Discord bot token into chat, source code, D1, `.dev.vars` committed to Git, screenshots, or bug reports.

## New Gateway protections

- A fresh connection calls Discord `/gateway/bot` before IDENTIFY.
- Invalid bot tokens halt before a WebSocket IDENTIFY is attempted.
- Existing sessions use Discord Gateway `RESUME` after reconnects.
- `error` no longer schedules an independent reconnect; all recovery funnels through one close handler.
- Terminal close codes halt the Gateway instead of reconnecting forever.
- Failed fresh sessions use exponential backoff with jitter.
- If Discord reports 5 or fewer remaining session starts, Orbit waits for the session-start window to reset instead of spending the final attempts.
- Heartbeat ACKs are tracked. Zombie connections close and attempt a resumable reconnect.
- Gateway state is stored in the Durable Object so a restart does not erase safety state.
- Diagnostics exposes runtime state and remaining IDENTIFY budget without exposing the token or session ID.

## Terminal halt reasons

- `authentication_failed` / `invalid_bot_token`: replace the bot token.
- `invalid_intents`: deploy corrected Gateway intents.
- `disallowed_intents`: enable the required intents in Discord Developer Portal or remove them from Orbit.
- `invalid_shard` / `sharding_required`: update Orbit's sharding strategy before retrying.
- `invalid_api_version`: update the Gateway API version before retrying.

A terminal halt is deliberate. It protects the bot token rather than repeatedly attempting to log in.
