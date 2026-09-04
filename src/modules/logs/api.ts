import type { Env } from '../../types';
import { json } from '../../http/responses';
import { loadGuildResources, validateChannelIds } from '../../discord/guild-resources';
import { audit } from '../../repositories/audit';

export async function logsApi(request:Request,env:Env,guildId:string,actorId:string):Promise<Response>{
  if(request.method==='POST')return updateAuditFeed(request,env,guildId,actorId);
  if(request.method!=='GET')return json({error:'method_not_allowed'},405);
  const auditRows=await env.DB.prepare('SELECT id,action AS event_type,actor_user_id,details AS payload_json,created_at FROM audit_events WHERE guild_id=? ORDER BY created_at DESC LIMIT 200').bind(guildId).all();
  let errors:any[]=[],feed:any={admin_log_channel_id:null,post_audit_events:0},auditDeliveryAvailable=true;
  const warnings:any[]=[];
  try{errors=(await env.DB.prepare('SELECT id,request_id,route,method,status,error_code,detail_json,created_at FROM orbit_error_log WHERE guild_id=? ORDER BY created_at DESC LIMIT 100').bind(guildId).all<any>()).results;}
  catch(error:any){if(!missingErrorLogTable(error))throw error;warnings.push({code:'migration_0029_required',detail:'Verbose error history is unavailable because D1 migration 0029_social_auth_verbose_errors.sql has not been applied. Run npm run db:remote, then reload this page.'});}
  try{feed=(await env.DB.prepare('SELECT admin_log_channel_id,post_audit_events FROM guild_config WHERE guild_id=?').bind(guildId).first<any>())||feed;}
  catch(error:any){if(!/no such column:\s*post_audit_events/i.test(String(error?.message||error||'')))throw error;auditDeliveryAvailable=false;warnings.push({code:'migration_0037_required',detail:'Discord Audit Feed requires D1 migration 0037_discord_audit_feed.sql. Run npm run db:remote before enabling it.'});}
  return json({events:auditRows.results,errors:errors.map((row:any)=>({...row,detail:parse(row.detail_json),recency:Number(row.created_at)>=Date.now()-60*60_000?'recent':'history'})),warnings,feed:{...feed,available:auditDeliveryAvailable,queue_available:Boolean(env.JOBS)}});
}

async function updateAuditFeed(request:Request,env:Env,guildId:string,actorId:string):Promise<Response>{
  const body=await request.json<any>(),operation=String(body.operation||'save_feed');
  if(operation==='test_feed'){
    const config=await env.DB.prepare('SELECT admin_log_channel_id,post_audit_events FROM guild_config WHERE guild_id=?').bind(guildId).first<any>();
    if(!config?.post_audit_events||!config?.admin_log_channel_id)return json({error:'audit_feed_disabled',detail:'Enable and save the Discord Audit Feed before sending a test.'},400);
    if(!env.JOBS)return json({error:'queue_unavailable',detail:'The Orbit job queue is unavailable, so the test cannot be delivered.'},503);
    await audit(env,guildId,null,'audit_feed_tested',{channel_id:config.admin_log_channel_id},actorId);
    return json({ok:true,queued:true});
  }
  if(operation!=='save_feed')return json({error:'invalid_operation',detail:'Choose a supported Logs operation.'},400);
  const channelId=String(body.admin_log_channel_id||''),enabled=Boolean(body.post_audit_events);
  if(enabled&&!channelId)return json({error:'log_channel_required',detail:'Choose a Discord channel before enabling the audit feed.'},400);
  if(enabled&&!env.JOBS)return json({error:'queue_unavailable',detail:'Orbit cannot enable the Audit Feed until its job queue binding is available.'},503);
  if(channelId){const resources=await loadGuildResources(env,guildId,{channels:true});if(!resources.ok)return json(resources,resources.status);const invalid=validateChannelIds(resources,[channelId]);if(invalid)return json(invalid,invalid.status);}
  const now=Date.now();
  await env.DB.prepare(`INSERT INTO guild_config(guild_id,updated_by,updated_at,admin_log_channel_id,post_audit_events) VALUES(?,?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET updated_by=excluded.updated_by,updated_at=excluded.updated_at,admin_log_channel_id=excluded.admin_log_channel_id,post_audit_events=excluded.post_audit_events`).bind(guildId,actorId,now,channelId||null,enabled?1:0).run();
  await audit(env,guildId,null,enabled?'audit_feed_enabled':'audit_feed_disabled',{channel_id:channelId||null,enabled},actorId);
  return json({ok:true,feed:{admin_log_channel_id:channelId||null,post_audit_events:enabled?1:0,available:true,queue_available:Boolean(env.JOBS)}});
}

function parse(raw:string){try{return JSON.parse(raw||'{}')}catch{return {raw:String(raw||'').slice(0,1200)}}}
function missingErrorLogTable(error:any){return /no such table:\s*orbit_error_log/i.test(String(error?.message||error||''))}
