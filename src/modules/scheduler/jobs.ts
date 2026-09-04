import type { Env, OrbitJob } from '../../types';
import { discord } from '../../discord/client';
import { pollCreatorSources } from '../creator/poll';
import { dispatchSocialPost, socialSweep } from '../social/dispatch';
import { dispatchTicketAction, dispatchTicketOpen } from '../tickets/interactions';
import { dispatchChannelManagerJob } from '../channel-manager/dispatch';
import { sendDiscordMessage } from '../../discord/messages';
import { nextRun } from './recurrence.js';
import { isGuildMessageChannel } from '../../discord/guild-resources';
import { dispatchAuditLog } from '../logs/dispatch';
import { recordSystemError } from '../../repositories/errors';
import { MAX_QUEUE_ATTEMPTS, queueRetryDecision } from './retry-policy.js';
import { dispatchEngagementQuestion, engagementSweep } from '../community-engagement/service';
import { updateActionJob } from '../../repositories/action-jobs';

const DISPATCH_LEASE_MS=2*60_000;

export async function handleQueue(batch: MessageBatch<OrbitJob>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      if (message.body.type === 'scheduled-post-dispatch') await dispatchPost(env,message.body.scheduledPostId);
      if (message.body.type === 'audit-log-dispatch') await dispatchAuditLog(env,message.body.auditEventId);
      if (message.body.type === 'social-dispatch') await dispatchSocialPost(env,message.body.socialPostId);
      if (message.body.type === 'ticket-open-dispatch') await dispatchTicketOpen(env,message.body);
      if (message.body.type === 'ticket-action-dispatch') await dispatchTicketAction(env,message.body);
      if (message.body.type === 'channel-manager-execute') await dispatchChannelManagerJob(env,message.body.jobId);
      if (message.body.type === 'community-engagement-dispatch') await dispatchEngagementQuestion(env,message.body.guildId);
      message.ack();
    } catch (error) {
      const attempts=Number(message.attempts||1),guildId=await jobGuildId(env,message.body);
      await recordSystemError(env,guildId,'/queue/orbit-jobs','QUEUE',500,attempts>=MAX_QUEUE_ATTEMPTS?'queue_job_exhausted':'queue_job_retrying',{
        job_type:message.body.type,
        attempts,
        message:error instanceof Error?error.message:String(error),
      });
      const decision=queueRetryDecision(attempts);
      if(!decision.retry){await markJobExhausted(env,message.body);message.ack();}
      else message.retry({delaySeconds:decision.delaySeconds});
    }
  }
}
async function dispatchPost(env:Env,id:number){
  const started=Date.now(),leaseUntil=started+DISPATCH_LEASE_MS;
  const claim=await env.DB.prepare("UPDATE scheduled_posts SET status='sending',dispatch_lease_until=?,dispatch_attempts=dispatch_attempts+1,updated_at=? WHERE id=? AND paused=0 AND dispatch_attempts<? AND (status='queued' OR (status='sending' AND COALESCE(dispatch_lease_until,0)<=?))")
    .bind(leaseUntil,started,id,MAX_QUEUE_ATTEMPTS,started).run();
  if(!claim.meta.changes)return;
  const post=await env.DB.prepare('SELECT * FROM scheduled_posts WHERE id=?').bind(id).first<any>();
  if(!post)return;

  try{
    const security=await env.DB.prepare('SELECT lockdown_active FROM security_configs WHERE guild_id=?').bind(post.guild_id).first<any>();
    if(security?.lockdown_active){await env.DB.prepare("UPDATE scheduled_posts SET status='queued',dispatch_lease_until=NULL,updated_at=? WHERE id=?").bind(Date.now(),id).run();return;}

    const content=parse(post.content_json),now=Date.now(),roleId=String(content.ping_role_id||'')||null;
    let errorCode:string|null=null,response:Response|null=null,discordMessageId:string|null=null,transient=false;
    if(!await isGuildMessageChannel(env,String(post.guild_id),String(post.channel_id)))errorCode='channel_guild_mismatch';
    if(roleId&&!errorCode){
      const rolesResponse=await discord(env,`/guilds/${post.guild_id}/roles`);
      if(!rolesResponse.ok){errorCode='role_validation_failed';transient=rolesResponse.status===429||rolesResponse.status>=500;}
      else{const roles=await rolesResponse.json<any[]>();if(!roles.some(role=>String(role.id)===roleId&&!role.managed&&role.mentionable))errorCode='role_unavailable';}
    }
    if(!errorCode){
      const prefix=roleId?`<@&${roleId}> `:'',text=`${prefix}${String(content.content||'')}`;
      if(text.length>2000)errorCode='message_too_long';
      else{
        const nonce=`orb-${id}-${Number(post.scheduled_for).toString(36)}`.slice(0,25);
        response=await sendDiscordMessage(env,String(post.channel_id),{content:text,pingRoleIds:roleId?[roleId]:[],nonce,enforce_nonce:true});
        if(response.ok)discordMessageId=String((await response.clone().json<any>()).id||'')||null;
        else{errorCode=`discord_${response.status}`;transient=response.status===429||response.status>=500;}
      }
    }

    const sent=Boolean(response?.ok);
    await env.DB.prepare('INSERT INTO scheduled_post_runs(scheduled_post_id,guild_id,status,discord_message_id,error_code,attempted_at,ping_role_id) VALUES(?,?,?,?,?,?,?)')
      .bind(id,post.guild_id,sent?'sent':'failed',discordMessageId,errorCode,now,roleId).run();
    if(sent&&post.recurrence_rule){
      const next=nextRun(Number(post.scheduled_for),post.recurrence_rule,String(post.timezone||'UTC'));
      await env.DB.prepare("UPDATE scheduled_posts SET scheduled_for=?,last_dispatch_attempt_at=?,status='queued',dispatch_lease_until=NULL,dispatch_attempts=0,updated_at=? WHERE id=?").bind(next,now,now,id).run();
    }else if(transient&&Number(post.dispatch_attempts)<MAX_QUEUE_ATTEMPTS){
      await env.DB.prepare("UPDATE scheduled_posts SET status='queued',last_dispatch_attempt_at=?,dispatch_lease_until=NULL,updated_at=? WHERE id=?").bind(now,now,id).run();
      throw new Error(errorCode||'scheduled_post_transient_failure');
    }else{
      await env.DB.prepare('UPDATE scheduled_posts SET status=?,last_dispatch_attempt_at=?,dispatch_lease_until=NULL,updated_at=? WHERE id=?').bind(sent?'sent':'failed',now,now,id).run();
      if(!sent&&response){
        let detail:any={};try{detail=await response.clone().json<any>()}catch{}
        await recordSystemError(env,String(post.guild_id),'/channels/:channel/messages','POST',response.status,'scheduled_post_delivery_failed',{message:detail?.message||errorCode,code:detail?.code||null,scheduled_post_id:id});
      }
    }
  }catch(error){
    const attempts=Number(post.dispatch_attempts||1),terminal=attempts>=MAX_QUEUE_ATTEMPTS;
    await env.DB.prepare('UPDATE scheduled_posts SET status=?,dispatch_lease_until=NULL,updated_at=? WHERE id=?').bind(terminal?'failed':'queued',Date.now(),id).run();
    throw error;
  }
}
function parse(raw:string){try{return JSON.parse(raw)}catch{return {content:raw}}}
export async function scheduledSweep(env: Env): Promise<void> {
  // Keep the Discord Gateway runtime alive for message/member based modules.
  try { const id=env.GATEWAY.idFromName('discord'); await env.GATEWAY.get(id).fetch('https://gateway/start',{method:'POST'}); } catch {}
  const cleanupNow=Date.now();await env.DB.batch([
    env.DB.prepare('DELETE FROM shield_events WHERE created_at<?').bind(cleanupNow-10*60_000),
    env.DB.prepare('DELETE FROM recent_messages WHERE created_at<?').bind(cleanupNow-2*60*60_000),
    env.DB.prepare('DELETE FROM oauth_states WHERE expires_at<=?').bind(cleanupNow),
    env.DB.prepare('DELETE FROM connection_oauth_states WHERE expires_at<=?').bind(cleanupNow),
    env.DB.prepare('DELETE FROM sessions WHERE COALESCE(session_expires_at,expires_at)<=?').bind(cleanupNow),
    env.DB.prepare('DELETE FROM orbit_error_log WHERE created_at<?').bind(cleanupNow-30*24*60*60_000),
    env.DB.prepare('DELETE FROM diagnostic_runs WHERE created_at<?').bind(cleanupNow-90*24*60*60_000),
  ]);
  await pollCreatorSources(env);
  await socialSweep(env);
  if (!env.JOBS) return; const now=Date.now();const due = await env.DB.prepare("SELECT id FROM scheduled_posts WHERE paused=0 AND scheduled_for<=? AND (status='queued' OR (status='sending' AND COALESCE(dispatch_lease_until,0)<=?)) ORDER BY scheduled_for ASC LIMIT 100").bind(now,now).all<{ id: number }>();
  for (const row of due.results) await env.JOBS.send({ type: 'scheduled-post-dispatch', scheduledPostId: row.id });
  const channelJobs=await env.DB.prepare("SELECT id FROM channel_manager_jobs WHERE status='queued' OR (status='running' AND COALESCE(lease_expires_at,0)<=?) ORDER BY created_at ASC LIMIT 20").bind(now).all<{id:number}>();
  for(const row of channelJobs.results)await env.JOBS.send({type:'channel-manager-execute',jobId:row.id});
  const auditEvents=await env.DB.prepare("SELECT a.id FROM audit_events a JOIN guild_config g ON g.guild_id=a.guild_id WHERE g.post_audit_events=1 AND g.admin_log_channel_id IS NOT NULL AND (a.discord_log_status IN ('pending','failed') OR (a.discord_log_status='sending' AND COALESCE(a.discord_log_lease_until,0)<=?)) ORDER BY a.created_at ASC LIMIT 100").bind(now).all<{id:number}>();
  for(const row of auditEvents.results)await env.JOBS.send({type:'audit-log-dispatch',auditEventId:row.id});
  await engagementSweep(env);
}

async function jobGuildId(env:Env,job:OrbitJob):Promise<string|null>{
  if('guildId' in job)return job.guildId;
  try{
    if(job.type==='scheduled-post-dispatch')return (await env.DB.prepare('SELECT guild_id FROM scheduled_posts WHERE id=?').bind(job.scheduledPostId).first<{guild_id:string}>())?.guild_id||null;
    if(job.type==='audit-log-dispatch')return (await env.DB.prepare('SELECT guild_id FROM audit_events WHERE id=?').bind(job.auditEventId).first<{guild_id:string}>())?.guild_id||null;
    if(job.type==='social-dispatch')return (await env.DB.prepare('SELECT guild_id FROM social_publish_posts WHERE id=?').bind(job.socialPostId).first<{guild_id:string}>())?.guild_id||null;
    if(job.type==='channel-manager-execute')return (await env.DB.prepare('SELECT guild_id FROM channel_manager_jobs WHERE id=?').bind(job.jobId).first<{guild_id:string}>())?.guild_id||null;
  }catch{}
  return null;
}

async function markJobExhausted(env:Env,job:OrbitJob):Promise<void>{
  const now=Date.now();
  try{
    if(job.type==='scheduled-post-dispatch')await env.DB.prepare("UPDATE scheduled_posts SET status='failed',dispatch_lease_until=NULL,updated_at=? WHERE id=?").bind(now,job.scheduledPostId).run();
    else if(job.type==='audit-log-dispatch')await env.DB.prepare("UPDATE audit_events SET discord_log_status='blocked',discord_log_lease_until=NULL,discord_log_attempted_at=? WHERE id=?").bind(now,job.auditEventId).run();
    else if(job.type==='social-dispatch')await env.DB.prepare("UPDATE social_publish_posts SET status='failed',dispatch_lease_until=NULL,updated_at=? WHERE id=?").bind(now,job.socialPostId).run();
    else if(job.type==='channel-manager-execute'){const row=await env.DB.prepare('SELECT action_job_id FROM channel_manager_jobs WHERE id=?').bind(job.jobId).first<any>();await env.DB.prepare("UPDATE channel_manager_jobs SET status='failed',lease_expires_at=NULL,heartbeat_at=?,finished_at=?,error_summary_json=? WHERE id=?").bind(now,now,JSON.stringify([{error:'queue_attempts_exhausted'}]),job.jobId).run();try{await updateActionJob(env,row?.action_job_id,{status:'failed',finished:true,errorCode:'queue_attempts_exhausted',progress:{error:'queue_attempts_exhausted'}})}catch{}}
    else if(job.type==='community-engagement-dispatch')await env.DB.prepare("UPDATE community_engagement_configs SET enabled=0,dispatch_lease_until=NULL,last_error='queue_attempts_exhausted',updated_at=? WHERE guild_id=?").bind(now,job.guildId).run();
    else if(job.type==='ticket-open-dispatch')await env.DB.prepare("UPDATE tickets SET status='failed',closed_at=? WHERE guild_id=? AND interaction_id=?").bind(now,job.guildId,job.interactionId).run();
  }catch(error){console.error('orbit queue terminal status update failed',{type:job.type,error:String(error).slice(0,300)});}
}
