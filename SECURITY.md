# orbitBot Security Baseline

This alpha fails closed on authentication, guild authorization, CSRF, Discord signatures, role hierarchy, and Turnstile validation.

Implemented in alpha.2:
- Discord OAuth state validation.
- HttpOnly, Secure, SameSite=Lax session cookies.
- Discord OAuth access tokens encrypted at rest with AES-GCM using `SESSION_SECRET`.
- Per-session CSRF token plus exact Origin validation for dashboard mutations.
- Server-side re-check of Manage Server/Administrator for guild administration.
- Discord interaction Ed25519 signature verification.
- Server-side role existence, managed-role, distinct-role, and hierarchy validation.
- One-use, random verification links stored only as SHA-256 hashes and expiring after 15 minutes.
- Turnstile Siteverify performed server-side, including expected action and allowed-hostname validation.
- No-store on authenticated JSON and verification pages.
- CSP, frame denial, nosniff, restrictive referrer/permissions policy, and HSTS.
- Secrets excluded from the repository; `.dev.vars` is gitignored.
- D1 is Worker-only.

Production Cloudflare configuration still required:
- Create production Turnstile credentials; never deploy test keys.
- Restrict the Turnstile widget to the orbitBot hostname.
- Configure Cloudflare WAF/rate-limit rules for OAuth, `/verify/*`, `/api/*`, and `/interactions` as appropriate.
- Keep preview/staging and production secrets separate.
- Monitor Discord/Cloudflare logs without logging tokens or secrets.
- Rotate Discord/Turnstile credentials if exposed.

Security note: this is an alpha, not a completed security audit. Do not treat the presence of these controls as a guarantee against vulnerabilities.
