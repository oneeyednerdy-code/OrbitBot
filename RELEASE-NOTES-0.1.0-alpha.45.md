# Orbit v0.1.0-alpha.45 — Reliable Ticket Panels

Alpha.45 repairs ticket panel posting and the member ticket-opening flow.

## Panel modes

- **Direct ticket button:** members select Open Ticket and Orbit opens the configured category directly. Categories with questions display the form first.
- **Category dropdown:** members choose from up to 25 enabled support categories.

The dashboard now supports editable panel copy and button labels, confirms successful posting with a Discord link, and displays Discord's error message, code, and an Orbit request reference if posting fails.

## Reliable private channel creation

Discord receives an immediate private acknowledgement while Orbit creates the ticket through its existing job queue. Migration `0033_ticket_interaction_jobs.sql` records the interaction id so a queue retry cannot create a duplicate ticket.

Private ticket channels explicitly grant access to Orbit, the opener, and configured staff roles after hiding the channel from `@everyone`. Form responses are displayed in a bounded embed rather than risking Discord's 2,000-character message limit.

## Deployment

Apply the new migration before deploying:

```bash
npm run db:remote
npm run deploy
```

No new secret, OAuth scope, Discord permission, or Cloudflare binding is required. The existing `JOBS` queue binding is used.
