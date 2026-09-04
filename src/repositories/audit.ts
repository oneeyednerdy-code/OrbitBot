import type { Env } from '../types';

export async function audit(env: Env, guildId: string, userId: string | null, action: string, details: unknown, actorUserId: string | null = null): Promise<void> {
  let auditEventId=0;
  try {
    const inserted=await env.DB.prepare('INSERT INTO audit_events(guild_id,user_id,actor_user_id,action,details,created_at) VALUES(?,?,?,?,?,?)')
      .bind(guildId, userId, actorUserId, action, JSON.stringify(details ?? {}), Date.now()).run();
    auditEventId=Number(inserted.meta.last_row_id);
  } catch (error) {
    console.error('orbit audit write failed',{guildId,action,error:String(error).slice(0,300)});
    return;
  }

  if(!auditEventId)return;
  try{
    const feed=await env.DB.prepare('SELECT admin_log_channel_id,post_audit_events FROM guild_config WHERE guild_id=?').bind(guildId).first<{admin_log_channel_id?:string;post_audit_events?:number}>();
    if(!feed?.post_audit_events||!feed.admin_log_channel_id||!env.JOBS){
      await env.DB.prepare("UPDATE audit_events SET discord_log_status='disabled' WHERE id=? AND discord_log_status='pending'").bind(auditEventId).run();
      return;
    }
    await env.JOBS.send({type:'audit-log-dispatch',auditEventId});
  }catch(error){
    // The event remains pending. The scheduled outbox sweep will enqueue it again.
    console.error('orbit audit delivery enqueue failed',{guildId,action,auditEventId,error:String(error).slice(0,300)});
  }
}
