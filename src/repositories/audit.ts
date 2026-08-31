import type { Env } from '../types';

export async function audit(env: Env, guildId: string, userId: string | null, action: string, details: unknown, actorUserId: string | null = null): Promise<void> {
  try {
    await env.DB.prepare('INSERT INTO audit_events(guild_id,user_id,actor_user_id,action,details,created_at) VALUES(?,?,?,?,?,?)')
      .bind(guildId, userId, actorUserId, action, JSON.stringify(details ?? {}), Date.now()).run();
  } catch {
    // Audit failure must never break the primary moderation/access action.
  }
}
