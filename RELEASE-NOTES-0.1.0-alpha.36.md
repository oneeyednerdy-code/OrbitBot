# Orbit v0.1.0-alpha.36

**Codename:** Gateway Storm Protection

This is a critical reliability release. Alpha.35 could repeatedly open fresh Discord Gateway sessions after failures, consuming Discord's IDENTIFY/session-start budget. Alpha.36 replaces that behavior with proper resume support, terminal-close halting, preflight budget checks, heartbeat ACK handling, and exponential backoff.

If Discord has already reset OrbitBot's token, deploy alpha.36 first while the old token is still invalid, then follow `ALPHA36-RECOVERY.md` to replace the Cloudflare `DISCORD_BOT_TOKEN` secret.

No D1 migration is added in this release. The cumulative migration count remains 29.
