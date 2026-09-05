# Orbit v0.1.0-alpha.69 — RSS Feed Manager

Alpha.69 adds the RSS-focused parts of AnnounceCast to Orbit’s existing Community Alerts module.

## Added

- Dedicated RSS / Atom feed manager in Community Alerts.
- Add RSS feed with a label, public HTTPS URL, Discord destination, optional role ping, and announcement template.
- List configured RSS and legacy Podcast RSS feeds with URL, destination, status, and last-check information.
- Remove RSS feed controls with guild-scoped deletion.
- Explicit `add_rss` and `remove_rss` API operations.
- Public HTTPS feed validation before saving.
- RSS feed results remain on Orbit’s existing duplicate-safe polling path.

## Notes

- RSS feeds use one configured Discord destination per feed.
- Existing Podcast RSS sources remain visible in the RSS list and can be removed there.
- Twitch, YouTube, and TikTok manual alerts remain separate from RSS management.
- No new D1 migration is required.

## Deployment

```bash
npm run db:remote
npm run deploy
```
