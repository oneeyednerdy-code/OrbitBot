import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { applyProtection, restoreProtection } from '../../discord/channel-protection';
import { json } from '../../http/responses';
import { audit } from '../../repositories/audit';

const ADMIN=1n<<3n,MANAGE_CHANNELS=1n<<4n,MANAGE_GUILD=1n<<5n,BAN=1n<<2n,MANAGE_ROLES=1n<<28n,MANAGE_WEBHOOKS=1n<<29n;

export async function securityApi(request:Request,env:Env,guildId:string,actorId:string):Promise<Response>{
  if(request.method==='GET'){
    const [config,scan]=await Promise.all([env.DB.prepare('SELECT * FROM security_configs WHERE guild_id=?').bind(guildId).first<any>(),scanGuild(env,guildId)]);
    return json({config:config??{},...scan});
  }
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  const body=await request.json<any>();const now=Date.now();
  if(body.op==='save'){
    const channelIds=Array.isArray(body.channel_ids)?body.channel_ids.map(String):[];
    await env.DB.prepare(`INSERT INTO security_configs(guild_id,lockdown_active,lockdown_channel_ids_json,alert_channel_id,updated_by,updated_at,operation_status,operation_errors_json) VALUES(?,0,?,?,?,?,?,'[]') ON CONFLICT(guild_id) DO UPDATE SET lockdown_channel_ids_json=excluded.lockdown_channel_ids_json,alert_channel_id=excluded.alert_channel_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(guildId,JSON.stringify(channelIds),body.alert_channel_id||null,actorId,now,'ready').run();
    return json({ok:true});
  }
  if(body.op==='lockdown_on'){
    if(body.confirm!=='LOCKDOWN')return json({error:'confirmation_required'},400);
    const config=await env.DB.prepare('SELECT * FROM security_configs WHERE guild_id=?').bind(guildId).first<any>();const channels=parse(config?.lockdown_channel_ids_json,[]).map(String);
    const result=await applyProtection(env,guildId,channels,'lockdown');
    await env.DB.prepare('UPDATE security_configs SET lockdown_active=?,operation_status=?,operation_errors_json=?,updated_by=?,updated_at=? WHERE guild_id=?').bind(result.completed?1:0,result.status,JSON.stringify(result.failures),actorId,now,guildId).run();
    await audit(env,guildId,actorId,'security_lockdown_enabled',{channels,operation_status:result.status,completed:result.completed,failures:result.failures.length});
    return protectionResponse(result,'lockdown_apply_incomplete');
  }
  if(body.op==='lockdown_off'){
    if(body.confirm!=='RESTORE')return json({error:'confirmation_required'},400);
    const result=await restoreProtection(env,guildId,'lockdown');
    await env.DB.prepare('UPDATE security_configs SET lockdown_active=?,operation_status=?,operation_errors_json=?,updated_by=?,updated_at=? WHERE guild_id=?').bind(result.failures.length?1:0,result.status,JSON.stringify(result.failures),actorId,now,guildId).run();
    await audit(env,guildId,actorId,'security_lockdown_restore',{operation_status:result.status,completed:result.completed,failures:result.failures.length});
    return protectionResponse(result,'lockdown_restore_incomplete');
  }
  return json({error:'bad_request'},400);
}

async function scanGuild(env:Env,guildId:string):Promise<any>{
  const response=await discord(env,`/guilds/${guildId}/roles`);if(!response.ok)return {score:0,findings:[{severity:'critical',title:'Could not inspect server roles',detail:`Discord returned ${response.status}`}]};
  const roles=await response.json<any[]>(),findings:any[]=[],everyone=roles.find(role=>role.id===guildId);
  if(everyone){const permissions=BigInt(everyone.permissions||'0');for(const [bit,title] of [[ADMIN,'@everyone has Administrator'],[MANAGE_CHANNELS,'@everyone can manage channels'],[MANAGE_GUILD,'@everyone can manage the server'],[BAN,'@everyone can ban members'],[MANAGE_ROLES,'@everyone can manage roles'],[MANAGE_WEBHOOKS,'@everyone can manage webhooks']] as const)if((permissions&bit)!==0n)findings.push({severity:'critical',title,detail:'Remove this permission from @everyone unless there is an exceptional reason.'});}
  for(const role of roles){const permissions=BigInt(role.permissions||'0');if(role.id!==guildId&&(permissions&ADMIN)!==0n)findings.push({severity:'warning',title:`${role.name} has Administrator`,detail:'Administrator bypasses channel-level restrictions. Prefer specific permissions where possible.'});}
  const penalty=findings.reduce((total,item)=>total+(item.severity==='critical'?20:7),0);return {score:Math.max(0,100-penalty),findings};
}

function parse(raw:any,fallback:any):any{try{return typeof raw==='string'?JSON.parse(raw):raw??fallback}catch{return fallback}}
function protectionResponse(result:any,error:string):Response{return json({ok:result.status==='completed',error:result.status==='completed'?undefined:error,detail:result.status==='completed'?undefined:`${result.failures.length} channel operation(s) failed. Snapshots were retained for retry.`,...result},result.status==='completed'?200:result.status==='partial'?409:502)}
