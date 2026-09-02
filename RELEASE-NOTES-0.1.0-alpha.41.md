# Orbit v0.1.0-alpha.41 — Page Transition Guard + Verification Panel

Alpha.41 fixes the Community-to-Leveling navigation race and completes the verification-channel setup flow.

## Page transition fix

- Community and Leveling now confirm they still own the current page after every asynchronous load.
- Late Community responses cannot replace the XP Leveling page.
- Save/refresh actions do not reopen a page after the administrator navigates elsewhere.
- Stale page errors are ignored while real errors on the active page remain visible.

## Verification channel workflow

- The Verification dashboard now includes a channel picker, editable panel message, and **Post Verification Panel** action.
- Orbit posts a **Verify with Orbit** Discord button instead of exposing a permanent verification URL.
- Clicking the button returns an ephemeral Discord response containing a private **Continue Verification** link.
- Each link is bound to the clicking Discord member, expires after 15 minutes, and cannot be reused after completion.
- After Turnstile succeeds, Orbit grants the configured Verified role and evaluates Combined access.
- The selected channel is verified as a text or announcement channel belonging to the managed server.

No migration, new secret, OAuth scope, or Discord permission is added. The existing Discord Interactions Endpoint URL must remain configured.
