# Orbit v0.1.0-alpha.57

## Site error fixes

- Fixed the Events page crash caused by rendering `data.events` before fetching the Events API response.
- Events now safely handles an empty or missing event array and still loads channel/role options when the bootstrap bundle is unavailable.
- Reliability scans now include the missing resource label, type, and Discord ID in the summary.
- The Operations Center explains how to repair a stale Discord reference and links directly to the owning Orbit module.

No new migration or Discord permission is required beyond alpha.56.
