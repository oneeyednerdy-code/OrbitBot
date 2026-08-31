# Start Here — Orbit v0.1.0-alpha.34

Orbit alpha.34 is a cumulative deployable build. You do **not** deploy the older patches one-by-one.

For a brand-new deployment, follow `DEPLOYMENT-GUIDE-WINDOWS-DETAILED.md` first, then `ALPHA31-SETUP.md` for the adaptive onboarding, social connection, diagnostics, and bug-report settings introduced in alpha.31. Alpha.32 requires no new secrets or migrations.

For an existing alpha.30 deployment, keep your current D1 database and Cloudflare resources. Follow `ALPHA31-SETUP.md`, apply pending migrations, add any new optional secrets you want, and deploy.
## Alpha.34 additions

Before testing social authorization, read `ALPHA34-SETUP.md`. Alpha.34 adds migration `0029_social_auth_verbose_errors.sql`; run `npm run db:remote` before deploying the Worker.

After deployment, test Discord Events, Role Panels, Applications/Appeals, Connections, and the verbose Logs page on a private server.

