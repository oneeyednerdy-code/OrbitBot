# Orbit v0.1.0-alpha.43 — Tickets Page Guard

Alpha.43 fixes the Tickets dashboard crash:

`Tickets failed (can't access property "outerHTML", ... is null).`

Tickets now captures the active guild before loading and verifies that the same guild and page still own the response before changing the dashboard. The same guard covers category creation, ticket-panel posting, refreshes, and error rendering.

This is a cumulative release containing alpha.42's role-gated Community Alerts. It adds no migration, secret, OAuth scope, or Discord permission.
