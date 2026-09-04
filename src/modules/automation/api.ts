import type { Env } from '../../types';
import { json } from '../../http/responses';
import { loadGuildResources, validateChannelIds, validateRoleIds } from '../../discord/guild-resources';
export async function automationApi(request:Request,env:Env,guildId:string,actorId:string):Promise<Response>{
 if(request.method==='GET'){const rows=await env.DB.prepare('SELECT * FROM automations WHERE guild_id=? ORDER BY created_at DESC').bind(guildId).all();return json({automations:rows.results});}
 if(request.method==='POST'){
  const body=await request.json<any>();const now=Date.now();
  if(body.op==='toggle'){await env.DB.prepare('UPDATE automations SET enabled=?,updated_at=? WHERE id=? AND guild_id=?').bind(body.enabled?1:0,now,Number(body.id),guildId).run();return json({ok:true});}
  const conditions=Array.isArray(body.conditions)?body.conditions:[],actions=Array.isArray(body.actions)?body.actions:[],triggerType=body.trigger?.type;
  if(!String(body.name||'').trim()||!['message_create','stream_end'].includes(triggerType)||actions.length<1||actions.length>10||conditions.length>10)return json({error:'invalid_automation',detail:'Choose a name, a supported trigger, up to 10 conditions, and 1–10 supported actions.'},400);
  if(triggerType==='stream_end'&&conditions.length)return json({error:'invalid_stream_end_conditions',detail:'Stream-end automations currently apply to every approved creator stream.'},400);
  if(conditions.some((item:any)=>!['channel_is','user_is','has_role'].includes(item?.type)))return json({error:'unsupported_condition',detail:'This automation contains a condition Orbit does not support.'},400);
  if(actions.some((item:any)=>!['send_message','add_role','remove_role','ban'].includes(item?.type)))return json({error:'unsupported_action',detail:'This automation contains an action Orbit does not support.'},400);
  if(triggerType==='stream_end'&&actions.some((item:any)=>item?.type!=='send_message'))return json({error:'unsupported_stream_end_action',detail:'Stream-end automations currently support Send message actions.'},400);
  const channelIds=[...conditions,...actions].filter((item:any)=>item?.channel_id).map((item:any)=>item.channel_id);const roleIds=actions.filter((item:any)=>item?.role_id).map((item:any)=>item.role_id);
  if(channelIds.length||roleIds.length){const resources=await loadGuildResources(env,guildId,{channels:channelIds.length>0,roles:roleIds.length>0});if(!resources.ok)return json(resources,resources.status);const badChannel=validateChannelIds(resources,channelIds);if(badChannel)return json(badChannel,badChannel.status);const badRole=validateRoleIds(resources,roleIds,{assignable:true});if(badRole)return json(badRole,badRole.status);}
  const values=[guildId,String(body.name).trim().slice(0,100),body.enabled===false?0:1,JSON.stringify(body.trigger),JSON.stringify(conditions),JSON.stringify(actions),actorId,now,now];
  if(body.op==='edit'){
   const id=Number(body.id);const existing=await env.DB.prepare('SELECT id FROM automations WHERE id=? AND guild_id=?').bind(id,guildId).first();if(!existing)return json({error:'not_found'},404);
   await env.DB.prepare('UPDATE automations SET name=?,enabled=?,trigger_json=?,conditions_json=?,actions_json=?,updated_at=? WHERE id=? AND guild_id=?').bind(values[1],values[2],values[3],values[4],values[5],now,id,guildId).run();return json({ok:true,id});
  }
  const r=await env.DB.prepare('INSERT INTO automations(guild_id,name,enabled,trigger_json,conditions_json,actions_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(...values).run();return json({ok:true,id:Number(r.meta.last_row_id)});
 }
 if(request.method==='DELETE'){const id=Number(new URL(request.url).searchParams.get('id'));await env.DB.prepare('DELETE FROM automations WHERE id=? AND guild_id=?').bind(id,guildId).run();return json({ok:true});}return json({error:'method_not_allowed'},405);
}
