import type { Env } from '../../types';
import { json } from '../../http/responses';
import { discord } from '../../discord/client';
import { loadGuildResources, validateChannelIds, validateRoleIds } from '../../discord/guild-resources';
import { botTopRolePosition } from '../../discord/permissions';
const defaultOwnerMessage='🔴 **{creator} is LIVE on Twitch!**\n{title}\n{url}';

export async function creatorApi(request:Request,env:Env,guildId:string,actorId:string,guild:any):Promise<Response>{
 if(request.method==='GET'){
  const [rows,automation,creators,states]=await Promise.all([
   env.DB.prepare('SELECT * FROM creator_sources WHERE guild_id=? ORDER BY created_at DESC').bind(guildId).all(),
   env.DB.prepare('SELECT * FROM creator_role_alert_configs WHERE guild_id=?').bind(guildId).first(),
   env.DB.prepare('SELECT id,discord_user_id,display_name,twitch_name,youtube_channel_id,approved,enabled FROM creator_directory WHERE guild_id=? ORDER BY display_name').bind(guildId).all(),
   env.DB.prepare('SELECT * FROM creator_role_alert_states WHERE guild_id=? ORDER BY last_checked_at DESC').bind(guildId).all(),
  ]);
  let ownerConfig:any=null,ownerConnections:any[]=[];
  if(guild?.owner===true){
   const [config,connections]=await Promise.all([
    env.DB.prepare(`SELECT o.*,c.account_label,c.account_login,c.account_id,c.status AS connection_status
      FROM owner_stream_alert_configs o LEFT JOIN creator_account_connections c ON c.id=o.connection_id
      WHERE o.guild_id=?`).bind(guildId).first<any>(),
    env.DB.prepare(`SELECT id,account_id,account_label,account_login,status
      FROM creator_account_connections WHERE guild_id=? AND platform='twitch' AND status='connected' AND connected_by=? ORDER BY updated_at DESC`).bind(guildId,actorId).all<any>(),
   ]);
   ownerConfig=config||null;ownerConnections=connections.results||[];
  }
  const roleStates=states.results as any[],lastCheckedAt=roleStates.reduce((latest,row)=>Math.max(latest,Number(row.last_checked_at||0)),0);
  return json({sources:rows.results,role_automation:automation||defaultAutomation(),role_automation_status:{configured:Boolean(automation),enabled:Number(automation?.enabled||0)===1,last_checked_at:lastCheckedAt||null,eligible_count:roleStates.filter(row=>Number(row.eligible)===1).length,live_count:roleStates.filter(row=>Number(row.last_live_state)===1).length,error_count:roleStates.filter(row=>row.last_error).length},directory_creators:creators.results,role_automation_states:states.results,owner_stream:guild?.owner===true?{owner_only:true,config:ownerConfig,connections:ownerConnections}:{owner_only:false}});
 }
  if(request.method==='POST'){const b=await request.json<any>();
  if(b.operation==='save_owner_stream')return saveOwnerStream(env,guildId,actorId,guild,b);
  if(b.operation==='delete_owner_stream')return deleteOwnerStream(env,guildId,guild);
  if(b.operation==='make_owner_role_mentionable'){
   if(guild?.owner!==true)return json({error:'owner_only',detail:'Only the Discord server owner can configure My Stream alerts.'},403);
   return makeRoleMentionable(env,guildId,b.role_id);
  }
   if(b.operation==='save_role_automation')return saveRoleAutomation(env,guildId,b);
  if(b.operation==='make_role_mentionable')return makeRoleMentionable(env,guildId,b.role_id);
  if(b.operation==='delete_role_automation'){
   await env.DB.batch([
    env.DB.prepare('DELETE FROM creator_role_alert_states WHERE guild_id=?').bind(guildId),
    env.DB.prepare('DELETE FROM creator_role_alert_configs WHERE guild_id=?').bind(guildId),
   ]);
   return json({ok:true});
  }
  if(!['rss','podcast','tiktok','youtube','twitch'].includes(b.source_type)||!b.label||!b.source_value||!b.discord_channel_id)return json({error:'invalid_source'},400);const now=Date.now();
  const resources=await loadGuildResources(env,guildId,{channels:true,roles:Boolean(b.mention_role_id)});if(!resources.ok)return json(resources,resources.status);const badChannel=validateChannelIds(resources,[b.discord_channel_id]);if(badChannel)return json(badChannel,badChannel.status);const badRole=validateRoleIds(resources,[b.mention_role_id].filter(Boolean),{mentionable:true});if(badRole)return json(badRole,badRole.status);
  if(b.id){await env.DB.prepare(`UPDATE creator_sources SET source_type=?,label=?,source_value=?,discord_channel_id=?,mention_role_id=?,live_message=?,offline_message=?,notify_live=?,notify_offline=?,vod_url=?,cooldown_minutes=?,enabled=?,updated_at=? WHERE id=? AND guild_id=?`).bind(b.source_type,String(b.label),String(b.source_value),String(b.discord_channel_id),b.mention_role_id||null,b.live_message||null,b.offline_message||null,b.notify_live===false?0:1,b.notify_offline?1:0,b.vod_url||null,Math.max(1,Number(b.cooldown_minutes||10)),b.enabled===false?0:1,now,Number(b.id),guildId).run();return json({ok:true});}
  const r=await env.DB.prepare(`INSERT INTO creator_sources(guild_id,source_type,label,source_value,discord_channel_id,mention_role_id,live_message,offline_message,notify_live,notify_offline,vod_url,cooldown_minutes,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`).bind(guildId,b.source_type,String(b.label),String(b.source_value),String(b.discord_channel_id),b.mention_role_id||null,b.live_message||null,b.offline_message||null,b.notify_live===false?0:1,b.notify_offline?1:0,b.vod_url||null,Math.max(1,Number(b.cooldown_minutes||10)),now,now).run();return json({ok:true,id:Number(r.meta.last_row_id)});}
 if(request.method==='DELETE'){const id=Number(new URL(request.url).searchParams.get('id'));await env.DB.prepare('DELETE FROM creator_sources WHERE id=? AND guild_id=?').bind(id,guildId).run();return json({ok:true});}return json({error:'method_not_allowed'},405);
}

async function saveOwnerStream(env:Env,guildId:string,actorId:string,guild:any,b:any):Promise<Response>{
 if(guild?.owner!==true)return json({error:'owner_only',detail:'Only the Discord server owner can configure My Stream alerts.'},403);
 const connectionId=Number(b.connection_id),channelId=String(b.discord_channel_id||''),mentionRoleId=String(b.mention_role_id||'');
 const enabled=Boolean(b.enabled);
 if(!Number.isInteger(connectionId)||!channelId)return json({error:'owner_stream_fields_required',detail:'Choose your Twitch account and a Discord destination channel.'},400);
 const connection=await env.DB.prepare(`SELECT id,account_label,account_login FROM creator_account_connections
   WHERE id=? AND guild_id=? AND platform='twitch' AND status='connected' AND connected_by=?`).bind(connectionId,guildId,actorId).first<any>();
 if(!connection)return json({error:'twitch_connection_not_found',detail:'Connect Twitch as the server owner before enabling My Stream alerts.'},404);
 if(!connection.account_login)return json({error:'twitch_reconnect_required',detail:'Reconnect Twitch from the My Stream section so Orbit can identify the channel securely.'},409);
 const message=String(b.live_message||defaultOwnerMessage);
 if(message.length>2000)return json({error:'message_too_long',detail:'The live message must be 2,000 characters or fewer.'},400);
 const resources=await loadGuildResources(env,guildId,{channels:true,roles:Boolean(mentionRoleId)});if(!resources.ok)return json(resources,resources.status);
 const badChannel=validateChannelIds(resources,[channelId]);if(badChannel)return json(badChannel,badChannel.status);
 const badRole=validateRoleIds(resources,[mentionRoleId].filter(Boolean),{mentionable:true});if(badRole)return json({error:'mention_role_unavailable',detail:'The ping role must exist in this server and be marked Mentionable in Discord.'},400);
 const now=Date.now(),interval=Math.min(60,Math.max(5,Number(b.poll_interval_minutes||5)));
 await env.DB.prepare(`INSERT INTO owner_stream_alert_configs(guild_id,connection_id,discord_channel_id,mention_role_id,live_message,poll_interval_minutes,enabled,last_live_state,last_stream_id,last_checked_at,last_notified_at,last_error,updated_by,created_at,updated_at)
   VALUES(?,?,?,?,?,?,?,NULL,NULL,NULL,NULL,NULL,?,?,?)
   ON CONFLICT(guild_id) DO UPDATE SET connection_id=excluded.connection_id,discord_channel_id=excluded.discord_channel_id,mention_role_id=excluded.mention_role_id,live_message=excluded.live_message,poll_interval_minutes=excluded.poll_interval_minutes,enabled=excluded.enabled,last_live_state=CASE WHEN owner_stream_alert_configs.connection_id<>excluded.connection_id THEN 0 ELSE owner_stream_alert_configs.last_live_state END,last_stream_id=CASE WHEN owner_stream_alert_configs.connection_id<>excluded.connection_id THEN NULL ELSE owner_stream_alert_configs.last_stream_id END,last_error=NULL,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
   .bind(guildId,connectionId,channelId,mentionRoleId||null,message,interval,enabled?1:0,actorId,now,now).run();
 return json({ok:true});
}

async function deleteOwnerStream(env:Env,guildId:string,guild:any):Promise<Response>{
 if(guild?.owner!==true)return json({error:'owner_only',detail:'Only the Discord server owner can configure My Stream alerts.'},403);
 await env.DB.prepare('DELETE FROM owner_stream_alert_configs WHERE guild_id=?').bind(guildId).run();
 return json({ok:true});
}

async function makeRoleMentionable(env:Env,guildId:string,rawRoleId:unknown):Promise<Response>{
 const roleId=String(rawRoleId||'');if(!/^\d+$/.test(roleId))return json({error:'invalid_role',detail:'Choose a Discord role first.'},400);
 const resources=await loadGuildResources(env,guildId,{channels:false,roles:true});if(!resources.ok)return json(resources,resources.status);
 const role=resources.roles.get(roleId);if(!role||role.name==='@everyone'||role.managed)return json({error:'role_unavailable',detail:'That role is missing, managed by Discord, or cannot be edited by Orbit.'},400);
 if(role.mentionable)return json({ok:true,already:true});
 const member=await discord(env,`/guilds/${guildId}/members/${env.DISCORD_CLIENT_ID}`);if(!member.ok)return json({error:'bot_member_unavailable',detail:'Orbit could not verify its role position in this server.'},409);
 const botTop=botTopRolePosition([...resources.roles.values()],await member.json<any>());if(Number(role.position||0)>=botTop)return json({error:'role_hierarchy',detail:'Move Orbit’s highest role above the selected role in Discord, then try again.'},400);
 const response=await discord(env,`/guilds/${guildId}/roles/${roleId}`,{method:'PATCH',body:JSON.stringify({mentionable:true})});if(!response.ok)return json({error:'role_update_failed',detail:`Discord rejected the role update (HTTP ${response.status}).`},400);
 return json({ok:true});
}

function defaultAutomation(){return {enabled:0,required_role_id:null,discord_channel_id:null,mention_role_id:null,live_message:'🔴 **{creator} is LIVE on {platform}!**\n{title}\n{url}',poll_interval_minutes:5};}

async function saveRoleAutomation(env:Env,guildId:string,b:any):Promise<Response>{
 const enabled=Boolean(b.enabled),requiredRoleId=String(b.required_role_id||''),channelId=String(b.discord_channel_id||''),mentionRoleId=String(b.mention_role_id||'');
 if(enabled&&(!requiredRoleId||!channelId))return json({error:'role_and_channel_required',detail:'Choose an eligible creator role and destination channel.'},400);
 if(String(b.live_message||'').length>2000)return json({error:'message_too_long',detail:'The alert template must be 2,000 characters or fewer.'},400);
 const resources=await loadGuildResources(env,guildId,{channels:Boolean(channelId),roles:Boolean(requiredRoleId||mentionRoleId)});if(!resources.ok)return json(resources,resources.status);
 const badChannel=validateChannelIds(resources,[channelId].filter(Boolean));if(badChannel)return json(badChannel,badChannel.status);
 const badRequired=validateRoleIds(resources,[requiredRoleId].filter(Boolean));if(badRequired)return json({error:'eligible_role_unavailable',detail:'The selected eligible creator role no longer exists or belongs to another server.'},400);
 const badMention=validateRoleIds(resources,[mentionRoleId].filter(Boolean),{mentionable:true});if(badMention)return json({error:'mention_role_unavailable',detail:'The ping role must exist in this server and be marked Mentionable in Discord.'},400);
 const now=Date.now(),interval=Math.min(60,Math.max(5,Number(b.poll_interval_minutes||5))),message=String(b.live_message||defaultAutomation().live_message);
 const previous=await env.DB.prepare('SELECT required_role_id FROM creator_role_alert_configs WHERE guild_id=?').bind(guildId).first<any>();
 await env.DB.prepare(`INSERT INTO creator_role_alert_configs(guild_id,enabled,required_role_id,discord_channel_id,mention_role_id,live_message,poll_interval_minutes,updated_by,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled,required_role_id=excluded.required_role_id,discord_channel_id=excluded.discord_channel_id,mention_role_id=excluded.mention_role_id,live_message=excluded.live_message,poll_interval_minutes=excluded.poll_interval_minutes,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
  .bind(guildId,enabled?1:0,requiredRoleId||null,channelId||null,mentionRoleId||null,message,interval,String(b.updated_by||'dashboard'),now,now).run();
 if(previous&&String(previous.required_role_id||'')!==requiredRoleId)await env.DB.prepare('DELETE FROM creator_role_alert_states WHERE guild_id=?').bind(guildId).run();
 return json({ok:true});
}
