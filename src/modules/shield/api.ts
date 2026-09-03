import type { Env } from '../../types';
import { json } from '../../http/responses';
import { activateShield,restoreShield } from './service';

export async function shieldApi(request:Request,env:Env,guildId:string,actorId:string):Promise<Response>{
  if(request.method==='GET')return json({config:(await env.DB.prepare('SELECT * FROM shield_configs WHERE guild_id=?').bind(guildId).first())??{}});
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  const body=await request.json<any>(),now=Date.now();
  if(body.op==='save'){
    const channelIds=Array.isArray(body.channel_ids)?body.channel_ids.map(String):[];
    await env.DB.prepare(`INSERT INTO shield_configs(guild_id,enabled,active,auto_activate,join_threshold,join_window_seconds,duplicate_threshold,mention_threshold,slowmode_seconds,channel_ids_json,alert_channel_id,alert_role_id,updated_by,updated_at,operation_status,operation_errors_json) VALUES(?,?,0,?,?,?,?,?,?,?,?,?,?,?,?, '[]') ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled,auto_activate=excluded.auto_activate,join_threshold=excluded.join_threshold,join_window_seconds=excluded.join_window_seconds,duplicate_threshold=excluded.duplicate_threshold,mention_threshold=excluded.mention_threshold,slowmode_seconds=excluded.slowmode_seconds,channel_ids_json=excluded.channel_ids_json,alert_channel_id=excluded.alert_channel_id,alert_role_id=excluded.alert_role_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(guildId,body.enabled?1:0,body.auto_activate!==false?1:0,Math.max(3,Number(body.join_threshold||15)),Math.max(10,Number(body.join_window_seconds||30)),Math.max(3,Number(body.duplicate_threshold||6)),Math.max(3,Number(body.mention_threshold||8)),Math.min(21600,Math.max(0,Number(body.slowmode_seconds||30))),JSON.stringify(channelIds),body.alert_channel_id||null,body.alert_role_id||null,actorId,now,'ready').run();
    return json({ok:true});
  }
  if(body.op==='activate'){
    const result=await activateShield(env,guildId,actorId,'Manual activation');
    if(result===false)return json({error:'shield_not_ready',detail:'Shield is disabled or already active.'},409);
    return protectionResponse(result,'shield_apply_incomplete');
  }
  if(body.op==='restore'){
    const result=await restoreShield(env,guildId,actorId);
    return protectionResponse(result,'shield_restore_incomplete');
  }
  return json({error:'bad_request'},400);
}

function protectionResponse(result:any,error:string):Response{return json({ok:result.status==='completed',error:result.status==='completed'?undefined:error,detail:result.status==='completed'?undefined:`${result.failures.length} channel operation(s) failed. Snapshots were retained for retry.`,...result},result.status==='completed'?200:result.status==='partial'?409:502)}
