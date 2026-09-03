import type { Env } from '../../types';
import { json } from '../../http/responses';
import { discord } from '../../discord/client';
import { loadGuildResources, validateChannelIds, validateRoleIds } from '../../discord/guild-resources';

export async function schedulerApi(request:Request,env:Env,guildId:string,actorId:string):Promise<Response>{
  if(request.method==='GET'){const [posts,templates,runs]=await Promise.all([env.DB.prepare('SELECT * FROM scheduled_posts WHERE guild_id=? ORDER BY scheduled_for ASC LIMIT 250').bind(guildId).all(),env.DB.prepare('SELECT * FROM post_templates WHERE guild_id=? ORDER BY name').bind(guildId).all(),env.DB.prepare('SELECT * FROM scheduled_post_runs WHERE guild_id=? ORDER BY attempted_at DESC LIMIT 250').bind(guildId).all()]);return json({posts:posts.results,templates:templates.results,runs:runs.results});}
  if(request.method==='POST'){
    const body=await request.json<any>();const op=body.op||'create';const now=Date.now();
    if(op==='create'||op==='batch'){
      const items=op==='batch'&&Array.isArray(body.posts)?body.posts:[body];const ids:number[]=[];
      const requestedRoleIds=[...new Set(items.map((item:any)=>String(item.ping_role_id||'')).filter(Boolean))];
      const channelIds=[...new Set(items.map((item:any)=>String(item.channel_id||'')).filter(Boolean))];
      const resources=await loadGuildResources(env,guildId,{channels:true,roles:requestedRoleIds.length>0});
      if(!resources.ok)return json(resources,resources.status);
      const channelFailure=validateChannelIds(resources,channelIds);if(channelFailure)return json(channelFailure,channelFailure.status);
      const roleFailure=validateRoleIds(resources,requestedRoleIds,{mentionable:true});if(roleFailure)return json(roleFailure,409);
      const mentionableRoles=new Map([...resources.roles.values()].map(role=>[String(role.id),String(role.name||role.id)]));
      for(const item of items.slice(0,100)){if(!item.channel_id||!item.content||!Number(item.scheduled_for))continue;const roleId=String(item.ping_role_id||'')||null;const message=String(item.content);const transportPrefix=roleId?`<@&${roleId}> `:'';if(transportPrefix.length+message.length>2000)return json({error:'message_too_long',detail:'Discord messages cannot exceed 2,000 characters, including the selected role mention.'},400);const contentJson={content:message,ping_role_id:roleId,ping_role_name:roleId?mentionableRoles.get(roleId)||null:null};const r=await env.DB.prepare('INSERT INTO scheduled_posts(guild_id,channel_id,content_json,timezone,scheduled_for,recurrence_rule,status,created_by,created_at,updated_at,paused,name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(guildId,String(item.channel_id),JSON.stringify(contentJson),String(item.timezone||'UTC'),Number(item.scheduled_for),item.recurrence_rule||null,'queued',actorId,now,now,0,item.name||null).run();ids.push(Number(r.meta.last_row_id));}return json({ok:true,ids});
    }
    if(op==='action'){
      const id=Number(body.id);const row=await env.DB.prepare('SELECT id FROM scheduled_posts WHERE id=? AND guild_id=?').bind(id,guildId).first();if(!row)return json({error:'not_found'},404);
      if(body.action==='pause'||body.action==='resume')await env.DB.prepare('UPDATE scheduled_posts SET paused=?,updated_at=? WHERE id=?').bind(body.action==='pause'?1:0,now,id).run();
      else if(body.action==='send_now'){await env.DB.prepare("UPDATE scheduled_posts SET scheduled_for=?,status='queued',paused=0,updated_at=? WHERE id=?").bind(now,now,id).run();if(env.JOBS)await env.JOBS.send({type:'scheduled-post-dispatch',scheduledPostId:id});}
      else if(body.action==='retry'){await env.DB.prepare("UPDATE scheduled_posts SET scheduled_for=?,status='queued',paused=0,updated_at=? WHERE id=?").bind(now,now,id).run();if(env.JOBS)await env.JOBS.send({type:'scheduled-post-dispatch',scheduledPostId:id});}
      else if(body.action==='delete')await env.DB.prepare('DELETE FROM scheduled_posts WHERE id=? AND guild_id=?').bind(id,guildId).run();
      return json({ok:true});
    }
  }
  return json({error:'method_not_allowed'},405);
}
