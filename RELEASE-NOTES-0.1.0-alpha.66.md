# Orbit v0.1.0-alpha.66 — Social Images and Discord Role Pings

Alpha.66 extends the deployed alpha.65 social publisher.

## Added

- Upload up to four JPEG, PNG, GIF, or WebP images through Orbit’s R2 storage.
- Attach images to Discord posts as native Discord message attachments.
- Publish images to Bluesky using native blobs and image embeds.
- Publish single images or image carousels to Threads.
- Upload images to Mastodon before publishing the status.
- Schedule image posts using the existing social queue.
- Choose a Discord role ping for social posts.
- Keep Discord role mentions restricted through `allowed_mentions` and require the role to be Mentionable.
- Added image retention cleanup for unused uploaded media.

## Storage and security

- Image uploads are scoped to the selected Discord server.
- Images are limited to 10 MB each and four images per post.
- Social credentials remain server-side and are never returned to the browser.
- Migration `0047_social_images_and_role_pings.sql` adds social media storage metadata and post fields.

## Deployment

Deploy the Worker and apply the new D1 migration:

```bash
npm run db:remote
npm run deploy
```

The existing `orbit_storage` R2 binding is required for image uploads.
