import type { Env } from '../../types';
import { addRole, discord } from '../../discord/client';
import { sendDiscordMessage } from '../../discord/messages';
import { recordSystemError } from '../../repositories/errors';
import { audit } from '../../repositories/audit';
import { runAutomations } from '../automation/engine';

export async function handleMemberAdd(env:Env,event:any){
  const guildId=event.guild_id,userId=event.user?.id;if(!guildId||!userId)return;
  const config=await env.DB.prepare('SELECT * FROM community_configs WHERE guild_id=?').bind(guildId).first<any>();
  if(config?.autorole_id){
    const assigned=await addRole(env,guildId,userId,String(config.autorole_id));
    if(!assigned.ok)await recordDiscordFailure(env,guildId,assigned,'/guilds/:guild/members/:member/roles/:role','PUT','welcome_autorole_failed');
    else await audit(env,guildId,userId,'welcome_autorole_assigned',{role_id:config.autorole_id});
  }
  if(config?.welcome_channel_id&&config?.welcome_message){
    const sent=await sendDiscordMessage(env,String(config.welcome_channel_id),{content:format(config.welcome_message,event),pingUserIds:[String(userId)]});
    if(!sent.ok)await recordDiscordFailure(env,guildId,sent,'/channels/:channel/messages','POST','welcome_message_failed');
    else await audit(env,guildId,userId,'welcome_message_sent',{channel_id:config.welcome_channel_id});
  }
  await runAutomations(env,guildId,'member_join',{user_id:userId,role_ids:event.roles||[]});
}

export async function handleMemberRemove(env:Env,event:any){
  const guildId=event.guild_id,userId=event.user?.id;if(!guildId||!userId)return;
  const config=await env.DB.prepare('SELECT * FROM community_configs WHERE guild_id=?').bind(guildId).first<any>();
  if(config?.goodbye_channel_id&&config?.goodbye_message){
    const sent=await sendDiscordMessage(env,String(config.goodbye_channel_id),{content:format(config.goodbye_message,event)});
    if(!sent.ok)await recordDiscordFailure(env,guildId,sent,'/channels/:channel/messages','POST','goodbye_message_failed');
    else await audit(env,guildId,userId,'goodbye_message_sent',{channel_id:config.goodbye_channel_id});
  }
  await runAutomations(env,guildId,'member_leave',{user_id:userId});
}

export async function handleCommunityMessage(env:Env,event:any){if(!event.guild_id||!event.channel_id||event.author?.bot)return;const content=String(event.content||'');if(content.startsWith('!')){const cmd=content.slice(1).trim().split(/\s+/)[0]?.toLowerCase();if(cmd){const row=await env.DB.prepare('SELECT response FROM custom_commands WHERE guild_id=? AND command=? AND enabled=1').bind(event.guild_id,cmd).first<any>();if(row)await discord(env,`/channels/${event.channel_id}/messages`,{method:'POST',body:JSON.stringify({content:format(row.response,event)})});}}
 const sticky=await env.DB.prepare('SELECT * FROM sticky_configs WHERE guild_id=? AND channel_id=? AND enabled=1').bind(event.guild_id,event.channel_id).first<any>();if(sticky){const count=(sticky.message_count||0)+1;if(count>=sticky.every_n_messages){if(sticky.last_message_id)await discord(env,`/channels/${event.channel_id}/messages/${sticky.last_message_id}`,{method:'DELETE'});const res=await discord(env,`/channels/${event.channel_id}/messages`,{method:'POST',body:JSON.stringify({content:sticky.content})});let id=null;if(res.ok)id=(await res.json<any>()).id;await env.DB.prepare('UPDATE sticky_configs SET message_count=0,last_message_id=? WHERE guild_id=? AND channel_id=?').bind(id,event.guild_id,event.channel_id).run();}else await env.DB.prepare('UPDATE sticky_configs SET message_count=? WHERE guild_id=? AND channel_id=?').bind(count,event.guild_id,event.channel_id).run();}}

async function recordDiscordFailure(env:Env,guildId:string,response:Response,route:string,method:string,code:string):Promise<void>{let detail:any={};try{detail=await response.json<any>()}catch{}await recordSystemError(env,guildId,route,method,response.status,code,detail);}
function format(value:string,event:any){return String(value).replaceAll('{user}',`<@${event.user?.id||event.author?.id||''}>`).replaceAll('{username}',event.user?.username||event.author?.username||'member').slice(0,2000);}
