# Orbit v0.1.0-alpha.46 — Ticket Resolution + Category Editing

Alpha.46 completes the support-ticket lifecycle and makes existing support categories editable.

## Ticket resolution

- Ticket opening messages contain **Close Ticket** and **Delete Ticket (Staff)** actions.
- Both actions open a Discord modal and require a reason.
- Close can be used by the ticket opener or ticket staff. It keeps the channel and history, and prevents the opener from sending additional messages.
- Delete is restricted to configured ticket staff, members with Manage Channels, or administrators. It removes the Discord channel.
- Close/delete reasons, timestamps, and acting users remain in Orbit's database and audit history.
- Discord failures are reported with a sanitized Orbit request reference.

## Category editing

- Existing categories have an **Edit** action in the dashboard.
- Edit loads the existing name, description, emoji, order, Discord parent category, enabled state, staff roles, and up to five ticket questions.
- **Save Changes** updates the same guild-scoped category instead of creating a duplicate.
- Orbit reminds administrators to repost category-dropdown panels after visible category details change. Updated questions apply automatically because the category ID remains stable.

## Deployment

Run the database migration before deploying:

```bash
npm run db:remote
npm run deploy
```

Migration `0034_ticket_resolution_reasons.sql` adds the ticket resolution metadata. No new secret, OAuth scope, Discord permission, Queue binding, or application command is required.
