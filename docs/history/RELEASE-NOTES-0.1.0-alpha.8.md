# Orbit 0.1.0-alpha.8 — Foundation

This release is a structural foundation update rather than a feature dump.

## Changed
- Rebuilt the dashboard around the Orbit product identity with Nerdspace Labs as the maker signature.
- Added persistent navigation for the full roadmap: Moderation, Roles, Verification, Tickets, Leveling, Automations, Scheduled Posts, Ko-fi, Social, Logs, Diagnostics, and Settings.
- Added online `Add Orbit to Discord` installation and server-specific reinstall actions.
- Split the Worker monolith into auth, Discord, HTTP, security, repository, and feature-module layers.
- Split the previous all-in-one dashboard HTML into HTML, CSS, and JavaScript assets.
- Added a single guild bootstrap request so dashboard loads no longer perform separate guild-authorization calls for roles, channels, and configuration.
- Preserved existing Discord OAuth, secure sessions, CSRF protection, role hierarchy checks, Turnstile verification, admin notifications, and audit behavior.
- Added migration `0006_orbit_foundation.sql` with storage contracts for future modules.
- Added staged Cloudflare KV, R2, Queue, and scheduler contracts without creating idle infrastructure costs before those modules activate.

## Roadmap contracts added
- Honeypot exemptions and configuration
- Moderation cases
- Role panels
- Ticket categories/tickets
- XP/level rewards
- Automations
- Scheduled posts/templates/run history
- Ko-fi integrations/milestones
- Social integrations/events
- Diagnostic runs

## Not yet active
The foundation pages and database contracts do not mean unfinished modules are functional. They are deliberately present now so later releases can activate features without repeatedly restructuring Orbit.
