import type { Env, OrbitJob } from '../../types';
import { discord } from '../../discord/client';
import { pollCreatorSources } from '../creator/poll';
import { dispatchSocialPost, socialSweep } from '../social/dispatch';
import { dispatchTicketAction, dispatchTicketOpen } from '../tickets/interactions';
import { dispatchChannelManagerJob } from '../channel-manager/dispatch';
import { sendDiscordMessage } from '../../discord/messages';
import { nextRun } from './recurrence.js';
import { isGuildMessageChannel } from '../../discord/guild-resources';

const DISPATCH_LEASE_MS=2*60_000;

export async function handleQueue(batch: MessageBatch<OrbitJob>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      if (message.body.type === 'scheduled-post-dispatch') await dispatchPost(env,message.body.scheduledPostId);
      if (message.body.type === 'social-dispatch') await dispatchSocialPost(env,message.body.socialPostId);
      if (message.body.type === 'ticket-open-dispatch') await dispatchTicketOpen(env,message.body);
      if (message.body.type === 'ticket-action-dispatch') await dispatchTicketAction(env,message.body);
      if (message.body.type === 'channel-manager-execute') await dispatchChannelManagerJob(env,message.body.jobId);
      message.ack();
    } catch { message.retry(); }
  }
}
async function dispatchPost(env:Env,id:number){
  const started=Date.now(),leaseUntil=started+DISPATCH_LEASE_MS;const claim=await env.DB.prepare("UPDATE scheduled_posts SET status='sending',dispatch_lease_until=?,dispatch_attempts=dispatch_attempts+1,updated_at=? WHERE id=? AND paused=0 AND (status='queued' OR (status='sending' AND COALESCE(dispatch_lease_until,0)<=?))").bind(leaseUntil,started,id,started).run();if(!claim.meta.changes)return;const post=await env.DB.prepare('SELECT * FROM scheduled_posts WHERE id=?').bind(id).first<any>();if(!post)return;const sec=await env.DB.prepare('SELECT lockdown_active FROM security_configs WHERE guild_id=?').bind(post.guild_id).first<any>();if(sec?.lockdown_active){await env.DB.prepare("UPDATE scheduled_posts SET status='queued',dispatch_lease_until=NULL,updated_at=? WHERE id=?").bind(Date.now(),id).run();return;}
  const content=parse(post.content_json);const now=Date.now();const roleId=String(content.ping_role_id||'')||null;let errorCode:string|null=null;
  if(!await isGuildMessageChannel(env,String(post.guild_id),String(post.channel_id)))errorCode='channel_guild_mismatch';
  if(roleId){const rolesResponse=await discord(env,`/guilds/${post.guild_id}/roles`);if(!rolesResponse.ok)errorCode='role_validation_failed';else{const roles=await rolesResponse.json<any[]>();const role=roles.find(role=>String(role.id)===roleId&&!role.managed&&role.mentionable);if(!role)errorCode='role_unavailable';}}
  let res:Response|null=null;let discordMessageId:string|null=null;
  if(!errorCode){const prefix=roleId?`<@&${roleId}> `:'';const text=`${prefix}${String(content.content||'')}`;if(text.length>2000)errorCode='message_too_long';else{const nonce=`orb-${id}-${Number(post.scheduled_for).toString(36)}`.slice(0,25);res=await sendDiscordMessage(env,String(post.channel_id),{content:text,pingRoleIds:roleId?[roleId]:[],nonce,enforce_nonce:true});if(res.ok)discordMessageId=(await res.clone().json<any>()).id;else errorCode=`discord_${res.status}`;}}
  const sent=Boolean(res?.ok);await env.DB.prepare('INSERT INTO scheduled_post_runs(scheduled_post_id,guild_id,status,discord_message_id,error_code,attempted_at,ping_role_id) VALUES(?,?,?,?,?,?,?)').bind(id,post.guild_id,sent?'sent':'failed',discordMessageId,errorCode,now,roleId).run();
  if(sent&&post.recurrence_rule){const next=nextRun(Number(post.scheduled_for),post.recurrence_rule,String(post.timezone||'UTC'));await env.DB.prepare("UPDATE scheduled_posts SET scheduled_for=?,last_dispatch_attempt_at=?,status='queued',dispatch_lease_until=NULL,updated_at=? WHERE id=?").bind(next,now,now,id).run();}
  else await env.DB.prepare('UPDATE scheduled_posts SET status=?,last_dispatch_attempt_at=?,dispatch_lease_until=NULL,updated_at=? WHERE id=?').bind(sent?'sent':'failed',now,now,id).run();
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
}
