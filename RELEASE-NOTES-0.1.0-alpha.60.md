# Orbit v0.1.0-alpha.60

## Direct short-form video uploads

- Added a file picker to Short-Form Video for MP4, MOV, and WebM uploads.
- Streams the selected file to the optional Cloudflare R2 `STORAGE` binding instead of loading the entire video into the browser or D1.
- Stores uploads under random guild-scoped keys and serves them through a provider-readable HTTPS media route.
- Adds upload size/type validation, audit events, expiry cleanup for unused uploads, and reuse of an uploaded file across scheduled posts.
- Keeps public HTTPS media URLs available as a fallback for existing workflows.

## Existing Discord structure editing

- Added Channel Manager editing for current categories and channels.
- Supports names, category membership, topics, slowmode, NSFW, voice/stage bitrate, and user limits where Discord supports them.
- Adds live validation for current IDs, category membership, category capacity, and no-op edits.
- Uses the existing owner-only preview, exact confirmation phrase, acknowledgement, automatic backup, queue, audit, and per-item failure reporting flow.

## Deployment

- Apply migrations through `0045_short_video_uploads.sql`.
- Uncomment and configure the `STORAGE` R2 binding to enable direct file uploads.
- No new Gateway intents are required.

## Validation

- 35 automated tests pass.
- TypeScript and browser syntax checks pass.
- Fresh D1 migrations through `0045` pass.
- Worker bundle and ZIP integrity checks pass.
