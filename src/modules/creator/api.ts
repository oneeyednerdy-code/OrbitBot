import type { Env } from '../../types';
import { json } from '../../http/responses';
import { discord } from '../../discord/client';
export async function creatorApi(request:Request,env:Env,guildId:string):Promise<Response>{
 if(request.method==='GET'){
  const [rows,automation,creators,states]=await Promise.all([
   env.DB.prepare('SELECT * FROM creator_sources WHERE guild_id=? ORDER BY created_at DESC').bind(guildId).all(),
   env.DB.prepare('SELECT * FROM creator_role_alert_configs WHERE guild_id=?').bind(guildId).first(),
   env.DB.prepare('SELECT id,discord_user_id,display_name,twitch_name,youtube_channel_id,approved,enabled FROM creator_directory WHERE guild_id=? ORDER BY display_name').bind(guildId).all(),
   env.DB.prepare('SELECT * FROM creator_role_alert_states WHERE guild_id=? ORDER BY last_checked_at DESC').bind(guildId).all(),
  ]);
  return json({sources:rows.results,role_automation:automation||defaultAutomation(),directory_creators:creators.results,role_automation_states:states.results});
 }
 if(request.method==='POST'){const b=await request.json<any>();
  if(b.operation==='save_role_automation')return saveRoleAutomation(env,guildId,b);
  if(!['rss','youtube','twitch'].includes(b.source_type)||!b.label||!b.source_value||!b.discord_channel_id)return json({error:'invalid_source'},400);const now=Date.now();
  if(b.id){await env.DB.prepare(`UPDATE creator_sources SET source_type=?,label=?,source_value=?,discord_channel_id=?,mention_role_id=?,live_message=?,offline_message=?,notify_live=?,notify_offline=?,vod_url=?,cooldown_minutes=?,enabled=?,updated_at=? WHERE id=? AND guild_id=?`).bind(b.source_type,String(b.label),String(b.source_value),String(b.discord_channel_id),b.mention_role_id||null,b.live_message||null,b.offline_message||null,b.notify_live===false?0:1,b.notify_offline?1:0,b.vod_url||null,Math.max(1,Number(b.cooldown_minutes||10)),b.enabled===false?0:1,now,Number(b.id),guildId).run();return json({ok:true});}
  const r=await env.DB.prepare(`INSERT INTO creator_sources(guild_id,source_type,label,source_value,discord_channel_id,mention_role_id,live_message,offline_message,notify_live,notify_offline,vod_url,cooldown_minutes,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`).bind(guildId,b.source_type,String(b.label),String(b.source_value),String(b.discord_channel_id),b.mention_role_id||null,b.live_message||null,b.offline_message||null,b.notify_live===false?0:1,b.notify_offline?1:0,b.vod_url||null,Math.max(1,Number(b.cooldown_minutes||10)),now,now).run();return json({ok:true,id:Number(r.meta.last_row_id)});}
 if(request.method==='DELETE'){const id=Number(new URL(request.url).searchParams.get('id'));await env.DB.prepare('DELETE FROM creator_sources WHERE id=? AND guild_id=?').bind(id,guildId).run();return json({ok:true});}return json({error:'method_not_allowed'},405);
}

function defaultAutomation(){return {enabled:0,required_role_id:null,discord_channel_id:null,mention_role_id:null,live_message:'🔴 **{creator} is LIVE on {platform}!**\n{title}\n{url}',poll_interval_minutes:5};}

async function saveRoleAutomation(env:Env,guildId:string,b:any):Promise<Response>{
 const enabled=Boolean(b.enabled),requiredRoleId=String(b.required_role_id||''),channelId=String(b.discord_channel_id||''),mentionRoleId=String(b.mention_role_id||'');
 if(enabled&&(!requiredRoleId||!channelId))return json({error:'role_and_channel_required',detail:'Choose an eligible creator role and destination channel.'},400);
 if(String(b.live_message||'').length>2000)return json({error:'message_too_long',detail:'The alert template must be 2,000 characters or fewer.'},400);
 if(requiredRoleId||mentionRoleId){
  const rolesResponse=await discord(env,`/guilds/${guildId}/roles`);
  if(!rolesResponse.ok)return json({error:'discord_roles_unavailable',detail:`Discord returned HTTP ${rolesResponse.status} while validating roles.`},502);
  const roles=await rolesResponse.json<any[]>(),required=roles.find(role=>String(role.id)===requiredRoleId&&role.name!=='@everyone');
  if(requiredRoleId&&!required)return json({error:'eligible_role_unavailable',detail:'The selected eligible creator role no longer exists.'},400);
  if(mentionRoleId&&!roles.some(role=>String(role.id)===mentionRoleId&&!role.managed&&role.mentionable))return json({error:'mention_role_unavailable',detail:'The ping role must exist and be marked Mentionable in Discord.'},400);
 }
 if(channelId){
  const channelsResponse=await discord(env,`/guilds/${guildId}/channels`);
  if(!channelsResponse.ok)return json({error:'discord_channels_unavailable',detail:`Discord returned HTTP ${channelsResponse.status} while validating the channel.`},502);
  const channels=await channelsResponse.json<any[]>();
  if(!channels.some(channel=>String(channel.id)===channelId&&(channel.type===0||channel.type===5)))return json({error:'destination_channel_unavailable',detail:'The selected Discord text channel no longer exists.'},400);
 }
 const now=Date.now(),interval=Math.min(60,Math.max(5,Number(b.poll_interval_minutes||5))),message=String(b.live_message||defaultAutomation().live_message);
 const previous=await env.DB.prepare('SELECT required_role_id FROM creator_role_alert_configs WHERE guild_id=?').bind(guildId).first<any>();
 await env.DB.prepare(`INSERT INTO creator_role_alert_configs(guild_id,enabled,required_role_id,discord_channel_id,mention_role_id,live_message,poll_interval_minutes,updated_by,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled,required_role_id=excluded.required_role_id,discord_channel_id=excluded.discord_channel_id,mention_role_id=excluded.mention_role_id,live_message=excluded.live_message,poll_interval_minutes=excluded.poll_interval_minutes,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
  .bind(guildId,enabled?1:0,requiredRoleId||null,channelId||null,mentionRoleId||null,message,interval,String(b.updated_by||'dashboard'),now,now).run();
 if(previous&&String(previous.required_role_id||'')!==requiredRoleId)await env.DB.prepare('DELETE FROM creator_role_alert_states WHERE guild_id=?').bind(guildId).run();
 return json({ok:true});
}
