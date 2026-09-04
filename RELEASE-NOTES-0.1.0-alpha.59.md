# Orbit v0.1.0-alpha.59

## Publishing modules

- Added official TikTok OAuth with Display API video polling, encrypted refreshable tokens, selected Discord destination, configurable polling interval, announcement template, and duplicate-safe video history.
- Added a separate Short-Form Video module and queue for YouTube Shorts, TikTok Direct Post, and Instagram Reels.
- Added YouTube upload OAuth, TikTok `video.publish` authorization, and Instagram Business Login connection cards.
- Added provider processing status checks for TikTok and Instagram, plus retry, cancel, delete, and post-now controls.
- Short-Form Video accepts a public HTTPS media URL; YouTube uses a resumable upload, while TikTok and Instagram pull the media URL.

## Social and Discord management

- Added live text counters for Discord, Bluesky, Threads, and Mastodon.
- Added server-side limit enforcement: Discord 2,000, Bluesky 300, Threads 500, and the connected Mastodon instance’s advertised limit when available.
- Social Management now has explicit **Post Now** and **Schedule Post** actions.

## Setup

- Apply migrations through `0044_short_video_posts.sql`.
- Add provider secrets in `DEPLOY-ME-FIRST.md`.
- Register `/connections/youtube/callback`, `/connections/tiktok/callback`, and `/connections/instagram/callback` with the matching provider apps.
- Provider approval, professional-account eligibility, verified media URL requirements, and unaudited/private-post restrictions remain controlled by each provider.
