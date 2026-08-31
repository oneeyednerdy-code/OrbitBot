# Orbit Architecture

## Backend

```text
src/
  index.ts                 Worker entrypoint only
  router.ts                top-level request routing
  types.ts                 bindings and shared job types
  auth/                    OAuth, session, guild authorization
  discord/                 Discord client + permission constants
  http/                    API router and response helpers
  repositories/            persistence helpers
  security/                crypto + security headers
  modules/
    access/                 rules/combined access behavior
    verification/           Turnstile verification flow
    diagnostics/            module/health foundations
    scheduler/              async scheduling foundation
```

The entrypoint must stay small. Feature modules should not import dashboard code and dashboard code should not contain secrets.

## Frontend

```text
public/
  index.html               semantic shell only
  css/
    app.css                dashboard design system
    verify.css             verification-specific UI
  js/
    core.js                shared state, API client, escaping/helpers
    pages.js               dashboard page renderers/actions
    app.js                 boot, server selection, navigation
```

As modules become functional, add feature-specific page files rather than allowing `pages.js` to become a new monolith.

## Tenant boundary

`guild_id` is the primary tenant boundary. API routes authorize the signed-in Discord user against the requested guild before reading or writing guild-specific configuration.

## Discord installation

`/oauth/install` builds the server-install authorization URL using `bot` + `applications.commands`. Orbit intentionally requests specific roadmap permissions and does not request Administrator.
