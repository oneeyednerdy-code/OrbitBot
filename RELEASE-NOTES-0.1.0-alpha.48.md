# Orbit v0.1.0-alpha.48 — Drag-and-Drop Hierarchy + Safer Sends

Alpha.48 makes Channel Manager visual, harder to trigger accidentally, and more responsive while pages or actions are loading.

## Channel hierarchy ordering

- Drag categories to reorder them.
- Drag channels within a category or drop them into another category.
- Drop a channel into **Uncategorized** to remove its parent category.
- Arrow buttons provide keyboard and mobile-friendly ordering within the current group.
- Bulk Create previews also support dragging new categories/channels before they are sent to Discord.
- Every existing hierarchy change is previewed, fingerprinted against Discord's current structure, backed up, and applied through the queue.
- Discord permission overwrites are preserved when channels move.
- Structural restore can reapply saved category membership and ordering; it still cannot recover deleted Discord messages or original channel IDs.

## Apply-to-Discord safety gate

- Create, reorder, delete, and restore require a preview.
- The owner must type the exact operation phrase and select an acknowledgement checkbox.
- Submit buttons remain disabled until both checks pass and lock immediately after activation.
- Orbit refuses a second Channel Manager operation while another job for the server is queued or running.
- API-side acknowledgement and stale-preview checks remain authoritative even if the UI is bypassed.

## Loading responsiveness

- Dashboard navigation paints an animated loading state before page data is requested.
- Scheduled Posts immediately locks the clicked button and shows visible progress before the API request begins.
- Scheduler failures restore the action and display an actionable error.
- Loading motion respects the operating system's reduced-motion preference.

## Form polish

- Standard dashboard and diagnostics checkboxes now use a compact 16px size aligned with their label text.
- Large custom feature-selection controls keep their intentional tile styling.

## Deployment

Alpha.48 uses the existing `0035_channel_manager.sql` schema. No new migration, secret, OAuth scope, bot permission, Queue binding, or Durable Object is required beyond alpha.47.
