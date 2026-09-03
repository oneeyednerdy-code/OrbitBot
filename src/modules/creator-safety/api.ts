import type { Env } from '../../types';
import { applyProtection, restoreProtection } from '../../discord/channel-protection';
import { json } from '../../http/responses';
import { audit } from '../../repositories/audit';

export async function creatorSafetyApi(request:Request,env:Env,guildId:string,actorId:string):Promise<Response>{
  if(request.method==='GET')return json({config:(await env.DB.prepare('SELECT * FROM creator_safety_configs WHERE guild_id=?').bind(guildId).first())??{}});
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  const body=await request.json<any>(),now=Date.now();
  if(body.op==='save'){
    const channelIds=Array.isArray(body.channel_ids)?body.channel_ids.map(String):[];
    await env.DB.prepare(`INSERT INTO creator_safety_configs(guild_id,enabled,active,channel_ids_json,alert_channel_id,updated_by,updated_at,operation_status,operation_errors_json) VALUES(?,?,0,?,?,?,?,?,'[]') ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled,channel_ids_json=excluded.channel_ids_json,alert_channel_id=excluded.alert_channel_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(guildId,body.enabled?1:0,JSON.stringify(channelIds),body.alert_channel_id||null,actorId,now,'ready').run();
    return json({ok:true});
  }
  if(body.op==='activate'){
    const config=await env.DB.prepare('SELECT * FROM creator_safety_configs WHERE guild_id=?').bind(guildId).first<any>();if(!config?.enabled)return json({error:'not_enabled'},409);
    const channels=parse(config.channel_ids_json,[]).map(String),result=await applyProtection(env,guildId,channels,'creator_safety');
    await env.DB.prepare('UPDATE creator_safety_configs SET active=?,operation_status=?,operation_errors_json=?,updated_by=?,updated_at=? WHERE guild_id=?').bind(result.completed?1:0,result.status,JSON.stringify(result.failures),actorId,now,guildId).run();
    await audit(env,guildId,actorId,'creator_safety_activated',{operation_status:result.status,completed:result.completed,failures:result.failures.length});
    return protectionResponse(result,'creator_safety_apply_incomplete');
  }
  if(body.op==='restore'){
    const result=await restoreProtection(env,guildId,'creator_safety');
    await env.DB.prepare('UPDATE creator_safety_configs SET active=?,operation_status=?,operation_errors_json=?,updated_by=?,updated_at=? WHERE guild_id=?').bind(result.failures.length?1:0,result.status,JSON.stringify(result.failures),actorId,now,guildId).run();
    await audit(env,guildId,actorId,'creator_safety_restored',{operation_status:result.status,completed:result.completed,failures:result.failures.length});
    return protectionResponse(result,'creator_safety_restore_incomplete');
  }
  return json({error:'bad_request'},400);
}

function parse(raw:any,fallback:any):any{try{return typeof raw==='string'?JSON.parse(raw):raw??fallback}catch{return fallback}}
function protectionResponse(result:any,error:string):Response{return json({ok:result.status==='completed',error:result.status==='completed'?undefined:error,detail:result.status==='completed'?undefined:`${result.failures.length} channel operation(s) failed. Snapshots were retained for retry.`,...result},result.status==='completed'?200:result.status==='partial'?409:502)}
