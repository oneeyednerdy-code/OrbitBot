# Orbit v0.1.0-alpha.44 — Common Role Panel Templates

Alpha.44 adds quick-start Role Panel templates:

- **Pronouns:** He/Him, She/Her, They/Them, He/They, She/They, It/Its, Neopronouns, Any Pronouns, and Ask Me.
- **Notification Pings:** Stream Alerts, Event Alerts, Community Updates, and Giveaways.
- **Interests:** Gaming, TTRPG, Content Creation, Tech, and Art.
- **Regions:** Americas, Europe, Asia-Pacific, and Oceania.

Choosing **Use Template** fills the panel name, message, and dropdown interaction, then matches common existing role names. If roles are missing, the administrator may explicitly enable **Create missing template roles in Discord**. Orbit never creates roles merely because a template was previewed.

Panel creation now validates that the destination is a server text channel, every selected role is assignable and below Orbit, the panel contains no more than 10 options, and Orbit has Manage Roles before creating missing roles. Panel text cannot trigger accidental mentions. If Discord refuses to post the panel, Orbit removes the incomplete panel record.

No D1 migration, new secret, OAuth scope, or Discord permission is required.
