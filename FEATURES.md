# Orbit Feature Set — alpha.70 cumulative build

## Core / UI
- Clean Nerdspace Labs-aligned Orbit dashboard
- Server picker and online bot installation
- No-logout Discord data refresh plus optional server channel-count search
- Owner-only editing of existing Discord categories and channels with live validation, backup, preview, and queued audit results
- Modular backend and split frontend page modules
- D1 migration system
- Diagnostics, audit logs, security-oriented error reporting, and an opt-in queued Discord Audit Feed

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
- Welcome/goodbye configuration with goodbye test delivery
- Auto-role
- Custom commands
- Sticky messages
- Community Engagement question prompts with daily, weekly, every-two-weeks, and monthly cadence
- Uploadable one-question-per-line `.txt` banks with persistent duplicate prevention
- Bundled Gamer, Pop Culture, Nerd, Twitch Streamer, Tabletop RPG, Sci-Fi/Fantasy, Horror, and Anime/Comics sample banks selectable from the dashboard
- Editable category-driven support tickets with staff roles and Discord modal questions
- Reason-required close (retain + lock) and staff-only delete workflows
- Ticket claiming/routing/transcript foundation
- Applications & Appeals forms/review workflow
- Community Health scan

## Engagement
- Message XP with manual grants
- Current Level reward inventory, edit/delete rewards, and leaderboard usernames + Discord IDs
- Automation engine using triggers/conditions/actions, stream-end variables, status, edit, toggle, and delete

## Publishing
- Scheduled Discord posts with edit/delete, repeat cadence, and Mentionable-role repair
- Queue-backed dispatch
- Recurring schedules
- Post templates/history
- Ko-fi webhook with owner-only verification-token setup, copyable system webhook URL, one URL per integration, payment totals, and milestone automation
- Ko-fi milestone creation, editing, enable/disable, and deletion
- Community Alerts for Twitch, YouTube, podcast RSS, TikTok feeds, and RSS
- Custom going-live/offline messages
- Per-alert Discord channel and ping role
- Twitch VOD link support after a stream ends and stream-end automation messages
- Server-owner-only My Stream Twitch authorization with a selected Discord destination, optional role ping, editable message, and duplicate-safe stream IDs
- Creator Directory
- Social publishing queue
- Bluesky, Mastodon and Threads adapters
- Social Management composer with platform-specific copy, live character counters, drafts, campaign tags, reusable templates, image alt text, and a 14-day calendar
- Separate Short-Form Video queue for YouTube Shorts, TikTok Direct Post, and Instagram Reels
- Short-Form Video file picker with server-side R2 storage plus public-HTTPS URL fallback
- YouTube, TikTok, and Instagram API login connections with encrypted server-side credentials
- Immediate or scheduled Discord posting from Social Management
- RSS feed manager with public HTTPS validation, add, list, duplicate-safe polling, configurable Discord destination, optional role ping, custom announcement template, and remove controls

## Events & Operations
- Community event management
- Native Discord Scheduled Event creation
- RSVP panels with Going / Maybe / Can't Go buttons, signup limits, and guild-scoped counts
- Operations Center with live creators, open tickets, queued posts, upcoming events, pending applications, moderation activity, Shield and Lockdown status
- Reliability Control Plane with Permission Doctor, role hierarchy checks, missing-resource drift, rate-limit buckets, gateway heartbeat state, and Action Center history
- Scheduled Events permission preflight with direct reauthorization guidance when Create Events is missing

## Roadmap still intentionally not claimed as complete
- YouTube Community publishing
- TikTok/Instagram provider approval and account-specific capabilities beyond the implemented video publishing flow
- X/Twitter publishing after the Ko-fi milestone system is established, including OAuth, text/image posts, scheduling, and URL-aware API-cost controls
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
# Counting

- One configurable Discord counting channel per server.
- Optional alternating-user enforcement, numbers-only parsing, wrong-number reset, invalid-message deletion, reactions, custom messages, activity history, and dashboard start/stop/reset controls.

# Birthdays

- Private month/day registration, removal, opt-out, configurable announcement channel/message/timezone, optional role ping, and once-per-year duplicate-safe posting.
