# Orbit — Discord App & OAuth Setup

## Dashboard OAuth
Add exact redirect URIs for your deployment:
- Local: `http://localhost:8787/oauth/callback`
- Production: `https://YOUR-ORBIT-HOST/oauth/callback`

Dashboard login requests only `identify guilds`. Every guild-specific API action re-checks that the signed-in user has Manage Server or Administrator in that guild.

## Online installation
Orbit exposes `/oauth/install` and dashboard **Add Orbit to Discord** buttons. Discord provides the server picker and authorization UI. Users can only add the app to servers where Discord allows them to manage integrations.

Current install scopes:
- `bot`
- `applications.commands`

Current active-feature permissions:
- Manage Roles
- View Channels
- Send Messages
- Read Message History

Orbit does **not** request Administrator. When future moderation/ticket modules become active, installation should request only the additional permissions those enabled modules require.

## Role hierarchy
Orbit can only manage roles below its highest Discord role. Place Orbit above the Rules, Verified, Combined Access, and any future self-assignable roles. The API rejects invalid, managed, `@everyone`, or too-high roles.

## Interactions endpoint
Set:

`https://YOUR-ORBIT-HOST/interactions`

Orbit verifies Discord's Ed25519 signature before processing interactions.

## Secrets
Store Discord Client Secret, Bot Token, Public Key, Session Secret, and Turnstile Secret as Worker secrets. Never expose them to browser JavaScript or commit them to source control.
