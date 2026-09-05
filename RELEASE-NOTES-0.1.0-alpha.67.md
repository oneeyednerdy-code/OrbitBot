# Orbit v0.1.0-alpha.67 — Social Composer v2

Alpha.67 improves the Social Management module while keeping existing alpha.66 posts backward-compatible.

## Added

- Platform-specific message variants for Discord, Threads, Bluesky, and Mastodon.
- Draft saving and editing.
- Reusable social templates with campaign labels.
- Campaign/tag metadata on queued posts.
- Image alt text captured during upload and sent to platforms that support it.
- A 14-day publishing calendar for scheduled posts.
- Social post edit, delete, and retry controls.
- Migration `0048_social_composer_v2.sql`.

## Notes

- Existing posts without platform variants continue using their shared `content` value.
- X/Twitter remains a later roadmap item after the Ko-fi milestone system is established.
- X/Twitter API budget controls are reserved for that future adapter.

## Deployment

```bash
npm run db:remote
npm run deploy
```
