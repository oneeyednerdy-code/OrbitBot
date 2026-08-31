import type { Env } from '../../types';
import { json } from '../../http/responses';

export async function connectionsApi(request: Request, env: Env, guildId: string): Promise<Response> {
  if (request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT id,platform,account_id,account_label,status,expires_at,created_at,updated_at
      FROM creator_account_connections WHERE guild_id=? ORDER BY platform,account_label`).bind(guildId).all();
    return json({
      connections: rows.results,
      availability: {
        twitch: Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET && env.SOCIAL_CREDENTIAL_KEY),
        youtube: Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET && env.SOCIAL_CREDENTIAL_KEY),
      }
    });
  }
  if (request.method === 'DELETE') {
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isFinite(id)) return json({ error: 'invalid_connection' }, 400);
    await env.DB.prepare('DELETE FROM creator_account_connections WHERE id=? AND guild_id=?').bind(id, guildId).run();
    return json({ ok: true });
  }
  return json({ error: 'method_not_allowed' }, 405);
}
