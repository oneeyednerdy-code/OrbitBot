# Orbit Security Baseline

Orbit follows the Nerdspace Labs Cloudflare-first security baseline and fails closed on authentication, guild authorization, CSRF, Discord signatures, role hierarchy, and Turnstile validation.

## Implemented
- Discord OAuth state stored as one-time, expiring hashes in D1.
- HttpOnly, Secure, SameSite=Lax session cookies.
- Discord OAuth access tokens encrypted at rest with AES-GCM using `SESSION_SECRET`.
- Per-session CSRF token plus exact Origin validation for dashboard mutations.
- Server-side Manage Server/Administrator re-authorization for guild administration.
- Discord Ed25519 signature verification for interactions.
- Role existence, distinct-role, managed-role, and hierarchy validation.
- Random one-use verification links stored only as SHA-256 hashes and expiring after 15 minutes.
- Turnstile Siteverify server-side validation including expected action and allowed hostname.
- `no-store` for authenticated JSON and verification pages.
- CSP, frame denial, nosniff, restrictive referrer/permissions policy, and HSTS.
- D1 is Worker-only.
- Discord bot install does not request Administrator.
- Turnstile secret and Discord credentials never enter browser JavaScript.

## Production Cloudflare controls still required
- WAF managed protections appropriate to the zone.
- Rate limiting for OAuth, verification, API, and interaction routes.
- Production-only Turnstile host restrictions.
- Separate staging/production secrets.
- Secret-safe logging and credential rotation procedures.

## Module security rules
- Honeypot hard-protects server owner and users with Administrator before configurable exemptions are evaluated.
- Moderator/staff exemptions use role IDs, not role names.
- Social tokens must remain server-side and encrypted/referenced; never return them to dashboard JS.
- R2 stores transcripts/assets, not secrets.
- KV must never become an authoritative permission/configuration store.

This is an alpha security baseline, not a completed security audit.
