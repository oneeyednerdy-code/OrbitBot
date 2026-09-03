import type { Env } from '../../types';
import { applyProtection, restoreProtection, type ProtectionResult } from '../../discord/channel-protection';
import { sendDiscordMessage } from '../../discord/messages';
import { audit } from '../../repositories/audit';
import { sha256 } from '../../security/crypto';

export async function activateShield(env:Env,guildId:string,actorId:string,reason:string):Promise<ProtectionResult|false>{
  const config=await env.DB.prepare('SELECT * FROM shield_configs WHERE guild_id=?').bind(guildId).first<any>();
  if(!config||!config.enabled||config.active)return false;
  const channels=parse(config.channel_ids_json,[]).map(String),now=Date.now();
  const result=await applyProtection(env,guildId,channels,'shield',Number(config.slowmode_seconds||30));
  await env.DB.prepare('UPDATE shield_configs SET active=?,activated_at=?,activated_reason=?,operation_status=?,operation_errors_json=?,updated_by=?,updated_at=? WHERE guild_id=?').bind(result.completed?1:0,result.completed?now:null,result.completed?reason:null,result.status,JSON.stringify(result.failures),actorId,now,guildId).run();
  if(config.alert_channel_id&&result.completed)await sendDiscordMessage(env,String(config.alert_channel_id),{content:`${config.alert_role_id?`<@&${config.alert_role_id}> `:''}🛡️ **Orbit Shield Mode activated**\nReason: ${reason}`,pingRoleIds:config.alert_role_id?[String(config.alert_role_id)]:[]});
  await audit(env,guildId,actorId,'shield_activated',{reason,channels,operation_status:result.status,completed:result.completed,failures:result.failures.length});
  return result;
}

export async function restoreShield(env:Env,guildId:string,actorId:string):Promise<ProtectionResult>{
  const result=await restoreProtection(env,guildId,'shield'),now=Date.now();
  await env.DB.prepare('UPDATE shield_configs SET active=?,activated_at=?,activated_reason=?,operation_status=?,operation_errors_json=?,updated_by=?,updated_at=? WHERE guild_id=?').bind(result.failures.length?1:0,result.failures.length?now:null,result.failures.length?'Restore incomplete':null,result.status,JSON.stringify(result.failures),actorId,now,guildId).run();
  await audit(env,guildId,actorId,'shield_restored',{operation_status:result.status,completed:result.completed,failures:result.failures.length});
  return result;
}

export async function shieldMemberJoin(env:Env,data:any):Promise<void>{
  const guildId=data.guild_id;if(!guildId)return;
  const config=await env.DB.prepare('SELECT * FROM shield_configs WHERE guild_id=?').bind(guildId).first<any>();if(!config?.enabled||!config.auto_activate||config.active)return;
  const now=Date.now();await env.DB.prepare("INSERT INTO shield_events(guild_id,event_type,actor_id,created_at) VALUES(?,'join',?,?)").bind(guildId,data.user?.id||null,now).run();
  const since=now-Number(config.join_window_seconds||30)*1000,count=await env.DB.prepare("SELECT COUNT(*) c FROM shield_events WHERE guild_id=? AND event_type='join' AND created_at>=?").bind(guildId,since).first<any>();
  if(Number(count?.c||0)>=Number(config.join_threshold||15))await activateShield(env,guildId,'orbit:auto','Join spike detected');
}

export async function shieldMessage(env:Env,data:any):Promise<void>{
  const guildId=data.guild_id;if(!guildId||data.author?.bot)return;
  const config=await env.DB.prepare('SELECT * FROM shield_configs WHERE guild_id=?').bind(guildId).first<any>();if(!config?.enabled||!config.auto_activate||config.active)return;
  const now=Date.now(),mentions=(data.mentions?.length||0)+(data.mention_roles?.length||0);
  if(mentions>=Number(config.mention_threshold||8)){await activateShield(env,guildId,'orbit:auto','Mention spam detected');return;}
  const normalized=String(data.content||'').trim().toLowerCase().replace(/\s+/g,' ');if(normalized.length<4)return;
  const fingerprint=await sha256(normalized);await env.DB.prepare("INSERT INTO shield_events(guild_id,event_type,actor_id,fingerprint,created_at) VALUES(?,'message',?,?,?)").bind(guildId,data.author?.id||null,fingerprint,now).run();
  const count=await env.DB.prepare("SELECT COUNT(DISTINCT actor_id) c FROM shield_events WHERE guild_id=? AND event_type='message' AND fingerprint=? AND created_at>=?").bind(guildId,fingerprint,now-30000).first<any>();
  if(Number(count?.c||0)>=Number(config.duplicate_threshold||6))await activateShield(env,guildId,'orbit:auto','Coordinated duplicate spam detected');
}

function parse(raw:any,fallback:any):any{try{return typeof raw==='string'?JSON.parse(raw):raw??fallback}catch{return fallback}}
