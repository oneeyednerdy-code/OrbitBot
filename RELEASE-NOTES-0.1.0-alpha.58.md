# Orbit v0.1.0-alpha.58

## Creator announcements

- Added podcast RSS and TikTok feed alert source types with a selected Discord destination.
- Added persistent source-item history so feed items are not announced twice.
- Added approved-creator automation status: enabled state, last check, eligible/live/error counts, edit, and delete.
- Added stream-end automation delivery with `{creator}`, `{platform}`, `{title}`, `{url}`, and `{vod_url}` variables.

## Control center fixes

- Added no-logout Discord data refresh for new channels, categories, roles, and feature settings.
- Added generic Automation edit/toggle/delete controls and Scheduled Posts edit/delete controls.
- Added guarded “Make selected role Mentionable” actions for scheduler and creator announcements.
- Added server search with optional channel-count loading for finding larger manageable Discord servers.
- Added repeatable event/scheduled-post cadence coverage, including every two weeks.
- Added leveling manual XP grants, leaderboard usernames plus Discord IDs, and role reward deletion.
- Added goodbye test delivery, sticky-save confirmation, and a Game Categories role-panel template.

## Migration

- Added `0042_creator_source_items.sql`.
