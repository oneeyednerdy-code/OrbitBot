import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { json } from '../../http/responses';

export async function memberLookupApi(request: Request, env: Env, guildId: string): Promise<Response> {
  const ids = [...new Set(new URL(request.url).searchParams.get('ids')?.split(',').map(value => value.trim()).filter(value => /^\d+$/.test(value)).slice(0, 100) || [])];
  const members: Record<string, any> = {};
  await Promise.all(ids.map(async id => { try { const response = await discord(env, `/guilds/${guildId}/members/${id}`); if (!response.ok) return; const member = await response.json<any>(), user = member.user || {}; members[id] = { id, display_name: member.nick || user.global_name || user.username || id, username: user.username || null, global_name: user.global_name || null }; } catch {} }));
  return json({ members });
}
