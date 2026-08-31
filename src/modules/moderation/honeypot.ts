import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { audit } from '../../repositories/audit';

export async function recordMessageAndCheckHoneypot(env: Env, event: any): Promise<void> {
  if (!event.guild_id || !event.channel_id || !event.id || !event.author?.id || event.author?.bot) return;
  const now = Date.now();
  await env.DB.prepare('INSERT OR REPLACE INTO recent_messages(guild_id,channel_id,message_id,author_user_id,created_at) VALUES(?,?,?,?,?)').bind(event.guild_id,event.channel_id,event.id,event.author.id,now).run();
  const config = await env.DB.prepare('SELECT * FROM honeypot_configs WHERE guild_id=?').bind(event.guild_id).first<any>();
  if (!config?.enabled || config.channel_id !== event.channel_id) return;
  const member = event.member;
  if (!member) return;
  const guildRes = await discord(env, `/guilds/${event.guild_id}`);
  if (!guildRes.ok) return;
  const guild = await guildRes.json<any>();
  if (guild.owner_id === event.author.id) return;
  const rolesRes = await discord(env, `/guilds/${event.guild_id}/roles`);
  if (!rolesRes.ok) return;
  const roles = await rolesRes.json<any[]>();
  const memberRoleSet = new Set<string>(member.roles ?? []);
  const isAdmin = roles.some(r => memberRoleSet.has(r.id) && (BigInt(r.permissions ?? '0') & (1n<<3n)) !== 0n);
  if (isAdmin) return;
  const exemptRoles = await env.DB.prepare('SELECT role_id FROM honeypot_exempt_roles WHERE guild_id=?').bind(event.guild_id).all<any>();
  if (exemptRoles.results.some(r => memberRoleSet.has(r.role_id))) return;
  const exemptUser = await env.DB.prepare('SELECT 1 ok FROM honeypot_exempt_users WHERE guild_id=? AND user_id=?').bind(event.guild_id,event.author.id).first();
  if (exemptUser) return;
  const botMemberRes = await discord(env, `/guilds/${event.guild_id}/members/${env.DISCORD_CLIENT_ID}`);
  if (!botMemberRes.ok) return;
  const botMember = await botMemberRes.json<any>();
  const top=(ids:string[])=>Math.max(...roles.filter(r=>ids.includes(r.id)).map(r=>r.position),0);
  if (top(member.roles??[]) >= top(botMember.roles??[])) { await audit(env,event.guild_id,event.author.id,'honeypot_blocked_hierarchy',{channel_id:event.channel_id}); return; }
  const recent = await env.DB.prepare('SELECT channel_id,message_id FROM recent_messages WHERE guild_id=? AND author_user_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 100').bind(event.guild_id,event.author.id,now-60*60_000).all<any>();
  let deleted=0;
  for (const msg of recent.results) { const res=await discord(env,`/channels/${msg.channel_id}/messages/${msg.message_id}`,{method:'DELETE'}); if(res.ok||res.status===404) deleted++; }
  const ban = await discord(env, `/guilds/${event.guild_id}/bans/${event.author.id}`, {method:'PUT',body:JSON.stringify({delete_message_seconds:0})});
  await env.DB.prepare('INSERT INTO moderation_cases(guild_id,target_user_id,actor_user_id,action,reason,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)').bind(event.guild_id,event.author.id,null,ban.ok?'honeypot_ban':'honeypot_ban_failed','Posted in honeypot',JSON.stringify({channel_id:event.channel_id,deleted_messages:deleted,status:ban.status}),now).run();
  await audit(env,event.guild_id,event.author.id,ban.ok?'honeypot_ban':'honeypot_ban_failed',{channel_id:event.channel_id,deleted_messages:deleted,status:ban.status});
  if (config.log_channel_id) await discord(env,`/channels/${config.log_channel_id}/messages`,{method:'POST',body:JSON.stringify({content:`🍯 Honeypot triggered for <@${event.author.id}>. ${ban.ok?'Banned':'Ban failed'}; removed ${deleted} recent message(s).`})});
}
