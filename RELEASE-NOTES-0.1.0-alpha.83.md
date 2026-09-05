# Orbit v0.1.0-alpha.83 — Channel Manager Permissions and Navigation

Alpha.83 improves the owner-only Channel Manager for large or permission-heavy Discord servers.

## Added

- Edit role permission overwrites directly on any existing category or channel.
- Add a role overwrite by choosing a server role and setting each supported permission to Allow, Deny, or Neutral / inherit.
- Preserve member overwrites and unsupported overwrite entries while editing role permissions.
- Validate role IDs during preview and require Orbit’s guild-level Manage Roles permission before queueing permission changes.
- Collapse or expand individual categories without changing the hierarchy plan.
- Collapse or reopen the complete server hierarchy from the Channel Manager header.
- Include live server roles in the Channel Manager inventory response.

No new D1 migration is required.
