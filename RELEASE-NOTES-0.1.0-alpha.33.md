# Orbit v0.1.0-alpha.33 — Bugfix + Form System

## Fixed
- Ko-fi milestones can now be edited from the dashboard. Editing updates the existing guild-scoped milestone instead of creating a duplicate.
- Dashboard text fields, number/date inputs, selects, and textareas now share the same Orbit dark-surface, violet-focus visual system across modules.
- Shield Mode no longer assumes its loading placeholder still exists after the async API response. Navigation/rerender races now exit safely instead of throwing a null `outerHTML` error.
- Logs now reads the real `audit_events` schema (`action` / `details`) and aliases it to the dashboard response contract, fixing the previous HTTP 500.

## Database / deployment
- No new D1 migration. Latest migration remains `0028_diagnostics_bug_reports.sql`.
- No new secrets, bindings, OAuth scopes, or Discord permissions.
- Deploy over alpha.32 and keep the existing D1 database.
