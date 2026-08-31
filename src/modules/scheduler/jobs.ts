import type { Env, OrbitJob } from '../../types';
import { discord } from '../../discord/client';
import { pollCreatorSources } from '../creator/poll';
import { dispatchSocialPost, socialSweep } from '../social/dispatch';

export async function handleQueue(batch: MessageBatch<OrbitJob>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      if (message.body.type === 'scheduled-post-dispatch') await dispatchPost(env,message.body.scheduledPostId);
      if (message.body.type === 'social-dispatch') await dispatchSocialPost(env,message.body.socialPostId);
      message.ack();
    } catch { message.retry(); }
  }
}
async function dispatchPost(env:Env,id:number){
  const post=await env.DB.prepare("SELECT * FROM scheduled_posts WHERE id=? AND status='queued' AND paused=0").bind(id).first<any>();if(!post)return;const sec=await env.DB.prepare('SELECT lockdown_active FROM security_configs WHERE guild_id=?').bind(post.guild_id).first<any>();if(sec?.lockdown_active)return;
  const content=parse(post.content_json);const now=Date.now();const res=await discord(env,`/channels/${post.channel_id}/messages`,{method:'POST',body:JSON.stringify({content:String(content.content||'').slice(0,2000)})});
  await env.DB.prepare('INSERT INTO scheduled_post_runs(scheduled_post_id,guild_id,status,discord_message_id,error_code,attempted_at) VALUES(?,?,?,?,?,?)').bind(id,post.guild_id,res.ok?'sent':'failed',res.ok?(await res.clone().json<any>()).id:null,res.ok?null:String(res.status),now).run();
  if(res.ok&&post.recurrence_rule){const next=nextRun(now,post.recurrence_rule);await env.DB.prepare("UPDATE scheduled_posts SET scheduled_for=?,last_dispatch_attempt_at=?,status='queued',updated_at=? WHERE id=?").bind(next,now,now,id).run();}
  else await env.DB.prepare('UPDATE scheduled_posts SET status=?,last_dispatch_attempt_at=?,updated_at=? WHERE id=?').bind(res.ok?'sent':'failed',now,now,id).run();
}
function nextRun(from:number,rule:string){const d=new Date(from);if(rule==='daily')return from+86400000;if(rule==='weekly')return from+604800000;if(rule==='monthly'){d.setUTCMonth(d.getUTCMonth()+1);return d.getTime();}return from+86400000;}
function parse(raw:string){try{return JSON.parse(raw)}catch{return {content:raw}}}
export async function scheduledSweep(env: Env): Promise<void> {
  // Keep the Discord Gateway runtime alive for message/member based modules.
  try { const id=env.GATEWAY.idFromName('discord'); await env.GATEWAY.get(id).fetch('https://gateway/start',{method:'POST'}); } catch {}
  await env.DB.prepare('DELETE FROM shield_events WHERE created_at<?').bind(Date.now()-10*60_000).run();
  await pollCreatorSources(env);
  await socialSweep(env);
  if (!env.JOBS) return; const due = await env.DB.prepare("SELECT id FROM scheduled_posts WHERE status='queued' AND paused=0 AND scheduled_for<=? ORDER BY scheduled_for ASC LIMIT 100").bind(Date.now()).all<{ id: number }>();
  for (const row of due.results) await env.JOBS.send({ type: 'scheduled-post-dispatch', scheduledPostId: row.id });
}
