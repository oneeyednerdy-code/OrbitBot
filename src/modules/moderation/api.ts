import type { Env } from '../../types';
import { json } from '../../http/responses';
import { loadGuildResources, validateChannelIds, validateRoleIds } from '../../discord/guild-resources';

export async function moderationApi(request: Request, env: Env, guildId: string, actorId: string): Promise<Response> {
  if (request.method === 'GET') {
    const [config, roles, users, cases] = await Promise.all([
      env.DB.prepare('SELECT * FROM honeypot_configs WHERE guild_id=?').bind(guildId).first(),
      env.DB.prepare('SELECT role_id FROM honeypot_exempt_roles WHERE guild_id=?').bind(guildId).all(),
      env.DB.prepare('SELECT user_id FROM honeypot_exempt_users WHERE guild_id=?').bind(guildId).all(),
      env.DB.prepare('SELECT * FROM moderation_cases WHERE guild_id=? ORDER BY created_at DESC LIMIT 100').bind(guildId).all(),
    ]);
    return json({ config: config ?? {}, exempt_roles: roles.results.map((r:any)=>r.role_id), exempt_users: users.results.map((r:any)=>r.user_id), cases: cases.results });
  }
  if (request.method === 'POST') {
    const body = await request.json<any>();
    const channelIds=[body.channel_id,body.log_channel_id].filter(Boolean);const roleIds=Array.isArray(body.exempt_roles)?body.exempt_roles:[];
    const resources=await loadGuildResources(env,guildId,{channels:channelIds.length>0,roles:roleIds.length>0});if(!resources.ok)return json(resources,resources.status);
    const badChannel=validateChannelIds(resources,channelIds);if(badChannel)return json(badChannel,badChannel.status);
    const badRole=validateRoleIds(resources,roleIds);if(badRole)return json(badRole,badRole.status);
    const now = Date.now();
    await env.DB.prepare(`INSERT INTO honeypot_configs(guild_id,enabled,channel_id,delete_trigger,cleanup_minutes,cleanup_scope,log_channel_id,updated_by,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled,channel_id=excluded.channel_id,delete_trigger=excluded.delete_trigger,cleanup_minutes=excluded.cleanup_minutes,cleanup_scope=excluded.cleanup_scope,log_channel_id=excluded.log_channel_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(guildId,body.enabled?1:0,body.channel_id||null,1,60,'guild',body.log_channel_id||null,actorId,now).run();
    await env.DB.prepare('DELETE FROM honeypot_exempt_roles WHERE guild_id=?').bind(guildId).run();
    for (const id of Array.isArray(body.exempt_roles)?body.exempt_roles:[]) await env.DB.prepare('INSERT OR IGNORE INTO honeypot_exempt_roles(guild_id,role_id) VALUES(?,?)').bind(guildId,String(id)).run();
    await env.DB.prepare('DELETE FROM honeypot_exempt_users WHERE guild_id=?').bind(guildId).run();
    for (const id of Array.isArray(body.exempt_users)?body.exempt_users:[]) if (/^\d+$/.test(String(id))) await env.DB.prepare('INSERT OR IGNORE INTO honeypot_exempt_users(guild_id,user_id) VALUES(?,?)').bind(guildId,String(id)).run();
    return json({ok:true});
  }
  return json({error:'method_not_allowed'},405);
}
