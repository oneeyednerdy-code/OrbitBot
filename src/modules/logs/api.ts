import type { Env } from '../../types';
import { json } from '../../http/responses';

export async function logsApi(env: Env, guildId: string): Promise<Response> {
  const rows = await env.DB.prepare('SELECT id,event_type,actor_user_id,payload_json,created_at FROM audit_events WHERE guild_id=? ORDER BY created_at DESC LIMIT 200').bind(guildId).all();
  return json({ events: rows.results });
}
