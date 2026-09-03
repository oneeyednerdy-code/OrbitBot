# Orbit Feature Set — alpha.31 unified build

## Core / UI
- Clean Nerdspace Labs-aligned Orbit dashboard
- Server picker and online bot installation
- Modular backend and split frontend page modules
- D1 migration system
- Diagnostics, audit logs and security-oriented error reporting

## Verification & Roles
- Discord OAuth dashboard authorization
- Cloudflare Turnstile verification
- Rules/verified/combined access roles
- Button and select-menu role panels
- Role hierarchy validation

## Moderation & Security
- Moderation cases
- Honeypot with owner/admin protection, exempt roles/users, automatic ban and recent message cleanup
- Security Center permission scan
- Reversible Incident Lockdown
- Shield Mode with manual or automatic activation from join spikes, mention spam and coordinated duplicate spam
- Reversible channel snapshots
- Creator Safety Mode for temporarily hiding preselected sensitive channels

## Community
- Welcome/goodbye configuration
- Auto-role
- Custom commands
- Sticky messages
- Editable category-driven support tickets with staff roles and Discord modal questions
- Reason-required close (retain + lock) and staff-only delete workflows
- Ticket claiming/routing/transcript foundation
- Applications & Appeals forms/review workflow
- Community Health scan

## Engagement
- Message XP
- Level rewards and leaderboard foundation
- Automation engine using triggers/conditions/actions

## Publishing
- Scheduled Discord posts
- Queue-backed dispatch
- Recurring schedules
- Post templates/history
- Ko-fi webhook and milestones
- Community Alerts for Twitch, YouTube and RSS
- Custom going-live/offline messages
- Per-alert Discord channel and ping role
- Twitch VOD link support after a stream ends
- Creator Directory
- Social publishing queue
- Bluesky, Mastodon and Threads adapters

## Events & Operations
- Community event management
- Native Discord Scheduled Event creation
- Operations Center with live creators, open tickets, queued posts, upcoming events, pending applications, moderation activity, Shield and Lockdown status

## Roadmap still intentionally not claimed as complete
- Instagram publishing
- TikTok publishing
- YouTube Community/video publishing
- Rich raid-train slot automation/check-in workflow
- Public anonymous-report intake without Discord authentication
- Full creator application public portal

Those remain future work rather than fake "working" buttons.


## alpha.31 experience layer
- Adaptive onboarding: server managers choose only the feature families they need.
- Adaptive navigation hides unused modules without deleting their configuration.
- Add More Features can expand the dashboard later.
- Connection Center exposes operator-configured Twitch and YouTube OAuth as simple Connect buttons.
- Persistent Diagnostics Drawer with health checks, copy/download report, and privacy-safe bug reporting.
- Developer Bug Inbox is restricted to Discord user IDs configured by the Orbit operator.

## Alpha.34 additions
- Threads OAuth connection for publishing.
- Mastodon per-instance OAuth connection.
- Bluesky app-password authorization with encrypted storage.
- Verbose sanitized browser request logs and server error logs.
- Discord Scheduled Event permission/error diagnostics.
- Role panel deletion removes the Discord panel message but preserves already assigned member roles.
- Applications/Appeals form editor with up to 10 add/remove questions and edit-in-place support.
- Simplified onboarding with no Discord community-type question.
