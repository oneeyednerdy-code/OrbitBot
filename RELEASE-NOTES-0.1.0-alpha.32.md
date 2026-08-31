# Orbit v0.1.0-alpha.32 — UI Layout Patch

## Fixed

- Restored the intended 7/5 desktop grid used by Scheduled Posts and Ko-fi by defining the missing `span-7` and `span-5` layout utilities.
- Added the missing `form-grid` layout used by Shield Mode and styled its select/input controls to match Orbit's dark UI.
- Made the left navigation independently scrollable when its items exceed the viewport while keeping the brand and Sign out action accessible.
- Added responsive behavior so 5/7-column cards collapse to full width on narrower layouts and Shield Mode form fields stack on phones.

## Deployment

This is a cumulative alpha.32 build based on alpha.31. There are no new D1 migrations, secrets, permissions, or integration setup steps. Existing alpha.31 deployments can replace the application code and redeploy.
