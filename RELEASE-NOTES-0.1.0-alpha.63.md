# Orbit v0.1.0-alpha.63 — Public Legal Pages

Alpha.63 adds public legal pages for OAuth consent and user access.

## Included

- Public `/privacy-policy` page.
- Public `/terms-of-service` page.
- Privacy Policy and Terms of Service links in the login and dashboard footers.
- Cross-links between both legal pages.
- Worker-routed extensionless URLs backed by static HTML assets.

## Deployment

Deploy the Worker normally. No D1 migration, Queue, R2, KV, OAuth scope, or Discord permission change is required.

Use these URLs in the Google Auth Platform consent configuration:

- `https://orbitbot.oneeyednerdy.workers.dev/privacy-policy`
- `https://orbitbot.oneeyednerdy.workers.dev/terms-of-service`
