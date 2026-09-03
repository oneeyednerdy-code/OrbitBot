import type { Env } from '../types';
import { discord } from './client';
import { recordSystemError } from '../repositories/errors';

export type ProtectionKind='lockdown'|'shield'|'creator_safety';
export type ProtectionFailure={channel_id:string;status:number;discord_code:string|null;detail:string;request_id:string};
export type ProtectionResult={status:'completed'|'partial'|'failed';completed:number;failures:ProtectionFailure[]};

const definitions={
  lockdown:{table:'lockdown_channel_snapshots',deny:1n<<11n},
  shield:{table:'shield_channel_snapshots',deny:1n<<11n},
  creator_safety:{table:'creator_safety_snapshots',deny:1n<<10n},
} as const;

export async function applyProtection(env:Env,guildId:string,ids:string[],kind:ProtectionKind,slowmode=0):Promise<ProtectionResult>{
  const definition=definitions[kind];let completed=0;const failures:ProtectionFailure[]=[];
  for(const channelId of [...new Set(ids.map(String))]){
    const channelResponse=await discord(env,`/channels/${channelId}`);
    if(!channelResponse.ok){failures.push(await failure(env,guildId,kind,channelId,'GET',channelResponse,'channel_snapshot_failed'));continue;}
    const channel=await channelResponse.json<any>();
    if(String(channel.guild_id)!==guildId){failures.push(await localFailure(env,guildId,kind,channelId,'channel_guild_mismatch','The channel does not belong to this server.'));continue;}
    const overwrites=Array.isArray(channel.permission_overwrites)?structuredClone(channel.permission_overwrites):[];
    if(kind==='shield')await env.DB.prepare('INSERT OR REPLACE INTO shield_channel_snapshots(guild_id,channel_id,permission_overwrites_json,rate_limit_per_user,captured_at,restore_status,last_error_code,last_attempt_at) VALUES(?,?,?,?,?,\'pending\',NULL,NULL)').bind(guildId,channelId,JSON.stringify(overwrites),Number(channel.rate_limit_per_user||0),Date.now()).run();
    else await env.DB.prepare(`INSERT OR REPLACE INTO ${definition.table}(guild_id,channel_id,permission_overwrites_json,captured_at,restore_status,last_error_code,last_attempt_at) VALUES(?,?,?,?,\'pending\',NULL,NULL)`).bind(guildId,channelId,JSON.stringify(overwrites),Date.now()).run();
    const changed=structuredClone(overwrites);const index=changed.findIndex((item:any)=>String(item.id)===guildId&&Number(item.type)===0);
    if(index>=0){changed[index].deny=(BigInt(changed[index].deny||'0')|definition.deny).toString();changed[index].allow=(BigInt(changed[index].allow||'0')&~definition.deny).toString();}
    else changed.push({id:guildId,type:0,allow:'0',deny:definition.deny.toString()});
    const payload:any={permission_overwrites:changed};if(kind==='shield')payload.rate_limit_per_user=Math.max(Number(channel.rate_limit_per_user||0),slowmode);
    const response=await discord(env,`/channels/${channelId}`,{method:'PATCH',body:JSON.stringify(payload)});
    if(response.ok){completed++;continue;}
    const item=await failure(env,guildId,kind,channelId,'PATCH',response,'channel_protection_failed');failures.push(item);await markSnapshotFailure(env,definition.table,guildId,channelId,item.discord_code||'channel_protection_failed');
  }
  return result(completed,failures);
}

export async function restoreProtection(env:Env,guildId:string,kind:ProtectionKind):Promise<ProtectionResult>{
  const definition=definitions[kind];const rows=(await env.DB.prepare(`SELECT * FROM ${definition.table} WHERE guild_id=?`).bind(guildId).all<any>()).results;let completed=0;const failures:ProtectionFailure[]=[];
  for(const row of rows){
    const payload:any={permission_overwrites:parse(row.permission_overwrites_json,[])};if(kind==='shield')payload.rate_limit_per_user=Number(row.rate_limit_per_user||0);
    const response=await discord(env,`/channels/${row.channel_id}`,{method:'PATCH',body:JSON.stringify(payload)});
    if(response.ok||response.status===404){await env.DB.prepare(`DELETE FROM ${definition.table} WHERE guild_id=? AND channel_id=?`).bind(guildId,row.channel_id).run();completed++;continue;}
    const item=await failure(env,guildId,kind,String(row.channel_id),'PATCH',response,'channel_restore_failed');failures.push(item);await markSnapshotFailure(env,definition.table,guildId,String(row.channel_id),item.discord_code||'channel_restore_failed');
  }
  return result(completed,failures);
}

async function markSnapshotFailure(env:Env,table:string,guildId:string,channelId:string,code:string):Promise<void>{await env.DB.prepare(`UPDATE ${table} SET restore_status='failed',last_error_code=?,last_attempt_at=? WHERE guild_id=? AND channel_id=?`).bind(code,Date.now(),guildId,channelId).run()}
async function failure(env:Env,guildId:string,kind:string,channelId:string,method:string,response:Response,code:string):Promise<ProtectionFailure>{let data:any={};try{data=await response.clone().json<any>()}catch{}const requestId=await recordSystemError(env,guildId,`${kind}/channels/:channel`,method,response.status,code,{channel_id:channelId,discord_code:data?.code,message:data?.message});return {channel_id:channelId,status:response.status,discord_code:data?.code?String(data.code):null,detail:String(data?.message||`Discord returned HTTP ${response.status}.`),request_id:requestId}}
async function localFailure(env:Env,guildId:string,kind:string,channelId:string,code:string,detail:string):Promise<ProtectionFailure>{const requestId=await recordSystemError(env,guildId,`${kind}/channels/:channel`,'VALIDATE',400,code,{channel_id:channelId,detail});return {channel_id:channelId,status:400,discord_code:null,detail,request_id:requestId}}
function result(completed:number,failures:ProtectionFailure[]):ProtectionResult{return {status:failures.length?(completed?'partial':'failed'):'completed',completed,failures}}
function parse(raw:any,fallback:any):any{try{return typeof raw==='string'?JSON.parse(raw):raw??fallback}catch{return fallback}}
