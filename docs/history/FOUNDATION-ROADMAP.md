# Orbit Foundation Roadmap

Orbit is a Nerdspace Labs product with its own control-center identity. The foundation release intentionally establishes navigation, storage contracts, service boundaries, and Cloudflare integration points before every feature is active.

## Product structure

### Active now
- Discord OAuth dashboard sessions
- Server selection for guilds the signed-in user can manage
- Online Add Orbit / reinstall flow through Discord authorization
- Rules role + Verified role + Combined access role
- Cloudflare Turnstile verification route with server-side Siteverify validation
- Admin role-change notifications
- Audit events

### Foundation laid
- Moderation and AutoMod
- Honeypot with hard owner/admin protection, configurable exempt roles/users, ban action, triggering-message deletion, and up-to-one-hour server message cleanup
- Role panels: reactions, buttons, select menus, groups, temporary roles
- Support tickets with dropdown categories, category-specific forms, staff routing, claim/transfer/reopen/close/transcripts
- XP/leveling and rewards
- Trigger/condition/action automations
- Scheduled posts, batch queue, recurring posts, templates, timezone handling, queue history, eventual CSV import/export
- Ko-fi milestones and Discord actions
- Diagnostics and module health

### Long-term creator roadmap
- Instagram
- TikTok
- YouTube
- Twitch
- Threads
- Bluesky
- Mastodon
- X/Twitter publishing after the Ko-fi milestone system is established
- RSS

The social architecture is intended to support both Orbit -> platform publishing and platform -> configured Discord channel notifications.

## Implementation sequence

1. Foundation + dashboard redesign
2. Verification hardening + diagnostics
3. Unified audit/mod logs
4. Honeypot + moderation actions
5. Role/button/select-menu system
6. Ticket system
7. Scheduled posts + queue
8. Leveling
9. Automation engine
10. Ko-fi milestones
11. X/Twitter publishing adapter with OAuth, text/image posts, scheduling, and URL-aware API-cost controls
12. Social adapters and social-to-Discord feeds

## Architecture rule

Feature logic must not be packed into the Worker entrypoint or dashboard HTML. New modules should use dedicated routes/services/repositories and shared infrastructure contracts.
