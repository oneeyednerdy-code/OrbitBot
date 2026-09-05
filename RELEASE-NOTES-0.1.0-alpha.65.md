# Orbit v0.1.0-alpha.65 — Application Panels + Two-Page Forms

Alpha.65 turns saved Applications & Appeals forms into Discord-native panels and adds a Discord-compliant two-page flow for forms with more than five questions.

## Added

- **Post to Channel** controls on every saved Applications & Appeals form.
- Configurable panel channel, title, description, and button label.
- Existing posted panels can be updated in place, repaired if the Discord message was deleted, moved to another channel, or deleted without deleting the saved form.
- The posted Discord button opens the saved form directly inside Discord.
- Forms with **1–5 questions** use one modal.
- Forms with **6–10 questions** use page 1, an ephemeral **Continue · Page 2 of 2** button, and a second modal.
- Page-1 answers are stored temporarily in D1 for 30 minutes and are bound to the form, server, and Discord user.
- Completed Discord form submissions are written to the existing pending review queue with interaction-level duplicate protection.
- Form and panel creation/update/delete/submission actions now produce Orbit audit events.

## Discord API constraint

Discord modal callbacks allow only 1–5 top-level modal components, and Discord does not allow a MODAL callback directly from a MODAL_SUBMIT interaction. Orbit therefore acknowledges page 1 with a private Continue button and opens page 2 from that button interaction.

## Migration

Run migration `0047_application_panels_and_paging.sql` before deploying the Worker.

```bash
npx wrangler d1 migrations apply DB --remote
npm run deploy
```

No new secret, OAuth scope, Discord privileged intent, Queue binding, or Durable Object is required.
