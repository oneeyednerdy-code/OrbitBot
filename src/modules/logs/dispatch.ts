import type { Env } from '../../types';
import { sendDiscordMessage } from '../../discord/messages';
import { recordSystemError } from '../../repositories/errors';

const LEASE_MS=2*60_000;
const SAFE_DETAIL_KEYS=new Set(['channel_id','role_id','panel_id','ticket_id','reward_id','automation_id','milestone_id','event_id','message_id','request_id','job_id','snapshot_id','level','xp','count','role_count','completed','failed','enabled','status','operation_status','roles_preserved','message_removed','replaced_missing_message']);

export async function dispatchAuditLog(env:Env,auditEventId:number):Promise<void>{
  const event=await env.DB.prepare(`SELECT a.id,a.guild_id,a.user_id,a.actor_user_id,a.action,a.details,a.created_at,a.discord_log_status,a.discord_log_lease_until,g.admin_log_channel_id,g.post_audit_events
    FROM audit_events a LEFT JOIN guild_config g ON g.guild_id=a.guild_id WHERE a.id=?`).bind(auditEventId).first<any>();
  if(!event)return;
  if(!event.post_audit_events||!event.admin_log_channel_id){await env.DB.prepare("UPDATE audit_events SET discord_log_status='disabled',discord_log_lease_until=NULL WHERE id=? AND discord_log_status<>'sent'").bind(auditEventId).run();return;}
  if(event.discord_log_status==='sent')return;
  const now=Date.now();
  const claimed=await env.DB.prepare("UPDATE audit_events SET discord_log_status='sending',discord_log_attempted_at=?,discord_log_lease_until=? WHERE id=? AND (discord_log_status IN ('pending','failed') OR (discord_log_status='sending' AND COALESCE(discord_log_lease_until,0)<=?))").bind(now,now+LEASE_MS,auditEventId,now).run();
  if(!claimed.meta.changes)return;

  const response=await sendDiscordMessage(env,String(event.admin_log_channel_id),{content:formatAuditMessage(event)});
  if(response.ok){const message=await response.json<any>();await env.DB.prepare("UPDATE audit_events SET discord_log_status='sent',discord_log_message_id=?,discord_log_attempted_at=?,discord_log_lease_until=NULL WHERE id=?").bind(String(message.id||''),Date.now(),auditEventId).run();return;}

  let detail:any={};try{detail=await response.json<any>()}catch{}
  const transient=response.status===429||response.status>=500;
  await env.DB.prepare('UPDATE audit_events SET discord_log_status=?,discord_log_attempted_at=?,discord_log_lease_until=NULL WHERE id=?').bind(transient?'failed':'blocked',Date.now(),auditEventId).run();
  await recordSystemError(env,String(event.guild_id),'/channels/:channel/messages','POST',response.status,'audit_feed_post_failed',{message:detail?.message||'Discord rejected the audit feed entry.',code:detail?.code||null,audit_event_id:auditEventId});
  if(transient)throw new Error(`audit_feed_discord_${response.status}`);
}

function formatAuditMessage(event:any):string{
  const lines=[`**Orbit Audit · ${humanize(event.action)}**`,`Event: \`#${Number(event.id)}\``,`Time: <t:${Math.floor(Number(event.created_at)/1000)}:F>`];
  if(event.actor_user_id)lines.push(`Actor: <@${event.actor_user_id}>`);
  else lines.push('Actor: Orbit / system');
  if(event.user_id&&String(event.user_id)!==String(event.actor_user_id||''))lines.push(`Member: <@${event.user_id}>`);
  const details=safeDetails(event.details);
  if(details.length)lines.push(`Details: ${details.join(' · ')}`);
  lines.push('Full sanitized entry: Orbit → Logs');
  return lines.join('\n').slice(0,2000);
}

function safeDetails(raw:unknown):string[]{
  let value:any={};try{value=typeof raw==='string'?JSON.parse(raw):raw||{}}catch{}
  if(!value||typeof value!=='object'||Array.isArray(value))return [];
  const output:string[]=[];
  for(const [key,item] of Object.entries(value)){
    if(output.length>=8)break;
    if(!SAFE_DETAIL_KEYS.has(key)&&!key.endsWith('_count'))continue;
    if(!['string','number','boolean'].includes(typeof item))continue;
    output.push(`**${humanize(key)}:** \`${clean(String(item))}\``);
  }
  return output;
}

function humanize(value:unknown):string{return String(value||'Orbit event').replace(/[_-]+/g,' ').replace(/\b\w/g,letter=>letter.toUpperCase()).slice(0,100)}
function clean(value:string):string{return value.replace(/[`\r\n]/g,' ').slice(0,120)}
