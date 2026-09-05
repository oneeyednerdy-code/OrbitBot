# Orbit v0.1.0-alpha.68 — Ko-fi Webhook and Milestone Management

Alpha.68 improves the Ko-fi module without adding a new database migration.

## Added

- One stable public webhook URL per Orbit/Ko-fi integration.
- Ko-fi verification-token entry in Orbit’s Ko-fi panel.
- Owner-only saving of the Ko-fi verification token.
- Hashed token storage; Orbit never returns the token after saving.
- Copyable webhook URL for pasting into Ko-fi.
- Support for Ko-fi’s verification token in the webhook payload.
- Backward-compatible handling for existing alpha.67 token-in-path webhook URLs.
- Milestone edit, enable/disable, and delete controls.
- Clear UI guidance that milestones are rules evaluated behind one webhook URL.

## Security

- The public URL no longer contains the Ko-fi verification token.
- The token is accepted only through the authenticated dashboard and saved as a SHA-256 hash.
- Existing webhook secrets remain excluded from configuration backups.

## Deployment

```bash
npm run db:remote
npm run deploy
```

No new D1 migration is required for this patch.
