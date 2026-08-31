# Build Validation — Orbit v0.1.0-alpha.32

Validation performed on the cumulative alpha.32 project snapshot:

- Browser JavaScript syntax checked with Node for `app.js`, `core.js`, `pages.js`, `diagnostics-drawer.js`, and every split page module.
- All relative ES module imports under `public/js` resolve to real files.
- `wrangler.jsonc` parses as JSONC/JSON5 and includes `/connections/*` in Worker-first routing.
- Full D1 migration chain applied in filename order to a fresh SQLite-compatible database using Python `sqlite3`.
- Result: **28 migrations**, **56 application tables**, no migration failures.
- New `orbit_bug_reports` and `orbit_bug_events` tables verified present.
- `package.json` version is `0.1.0-alpha.32`.
- A normal `npm install` attempt in the build environment timed out because package-network access was unavailable. The project therefore still requires the documented `npm install` and `npm run typecheck` on the deployment computer before production deployment.

Live OAuth, Discord Gateway behavior, Discord permissions, and third-party API responses require real production credentials and should be tested with a private Discord server before broad rollout.

## alpha.32 UI patch validation

- Confirmed `span-5` and `span-7` CSS utilities exist and collapse to 12 columns below 940px.
- Confirmed Shield Mode `form-grid` now has explicit responsive grid and select/input styling.
- Confirmed `#nav` owns vertical overflow with `min-height: 0`, keeping the sidebar footer outside the scrolling region.
- No database schema or backend behavior changed in alpha.32.
