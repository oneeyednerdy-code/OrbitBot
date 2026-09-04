# Orbit v0.1.0-alpha.54 — Community Engagement

Alpha.54 adds a recurring Community Engagement question module.

## Community Engagement

- Added a dedicated dashboard page under Community.
- Choose a Discord channel and schedule questions daily, weekly, every two weeks, or monthly.
- Added a bundled starter question bank at `questions/community-engagement.txt`.
- Added upload support for custom plain-text `.txt` files with one question per line.
- Blank lines and duplicate lines inside an upload are ignored.
- Posted questions are recorded by normalized question key, so the same question cannot be posted twice for the server, even after changing question banks.
- The module stops safely and reports `question_bank_exhausted` when every question in the active bank has already been used.
- Uses the existing Queue, scheduler sweep, Discord message safety, audit log, and retry protections.

## Deployment

- Apply migration `0038_community_engagement.sql` before deploying.
- No new secret, OAuth scope, privileged intent, Discord permission, Queue binding, or Durable Object is required.
