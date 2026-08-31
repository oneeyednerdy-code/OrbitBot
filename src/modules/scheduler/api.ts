import type { Env } from '../../types';
import { json } from '../../http/responses';

export async function schedulerApi(request:Request,env:Env,guildId:string,actorId:string):Promise<Response>{
  if(request.method==='GET'){const posts=await env.DB.prepare('SELECT * FROM scheduled_posts WHERE guild_id=? ORDER BY scheduled_for ASC LIMIT 250').bind(guildId).all();const templates=await env.DB.prepare('SELECT * FROM post_templates WHERE guild_id=? ORDER BY name').bind(guildId).all();return json({posts:posts.results,templates:templates.results});}
  if(request.method==='POST'){
    const body=await request.json<any>();const op=body.op||'create';const now=Date.now();
    if(op==='create'||op==='batch'){
      const items=op==='batch'&&Array.isArray(body.posts)?body.posts:[body];const ids:number[]=[];
      for(const item of items.slice(0,100)){if(!item.channel_id||!item.content||!Number(item.scheduled_for))continue;const r=await env.DB.prepare('INSERT INTO scheduled_posts(guild_id,channel_id,content_json,timezone,scheduled_for,recurrence_rule,status,created_by,created_at,updated_at,paused,name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(guildId,String(item.channel_id),JSON.stringify({content:String(item.content)}),String(item.timezone||'UTC'),Number(item.scheduled_for),item.recurrence_rule||null,'queued',actorId,now,now,0,item.name||null).run();ids.push(Number(r.meta.last_row_id));}return json({ok:true,ids});
    }
    if(op==='action'){
      const id=Number(body.id);const row=await env.DB.prepare('SELECT id FROM scheduled_posts WHERE id=? AND guild_id=?').bind(id,guildId).first();if(!row)return json({error:'not_found'},404);
      if(body.action==='pause'||body.action==='resume')await env.DB.prepare('UPDATE scheduled_posts SET paused=?,updated_at=? WHERE id=?').bind(body.action==='pause'?1:0,now,id).run();
      else if(body.action==='send_now'){await env.DB.prepare("UPDATE scheduled_posts SET scheduled_for=?,status='queued',paused=0,updated_at=? WHERE id=?").bind(now,now,id).run();if(env.JOBS)await env.JOBS.send({type:'scheduled-post-dispatch',scheduledPostId:id});}
      else if(body.action==='delete')await env.DB.prepare('DELETE FROM scheduled_posts WHERE id=? AND guild_id=?').bind(id,guildId).run();
      return json({ok:true});
    }
  }
  return json({error:'method_not_allowed'},405);
}
