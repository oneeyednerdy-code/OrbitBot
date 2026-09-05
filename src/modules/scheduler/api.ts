import type { Env } from '../../types';
import { json } from '../../http/responses';
import { discord } from '../../discord/client';
import { loadGuildResources, validateChannelIds, validateRoleIds } from '../../discord/guild-resources';
import { botTopRolePosition } from '../../discord/permissions';

export async function schedulerApi(request:Request,env:Env,guildId:string,actorId:string):Promise<Response>{
 if(request.method==='GET'){const [posts,templates,runs]=await Promise.all([env.DB.prepare("SELECT * FROM scheduled_posts WHERE guild_id=? ORDER BY CASE WHEN status IN ('queued','sending') AND scheduled_for IS NOT NULL THEN 0 ELSE 1 END, CASE WHEN status IN ('queued','sending') AND scheduled_for IS NOT NULL THEN scheduled_for END ASC, COALESCE(updated_at,created_at) DESC LIMIT 250").bind(guildId).all(),env.DB.prepare('SELECT * FROM post_templates WHERE guild_id=? ORDER BY name').bind(guildId).all(),env.DB.prepare('SELECT * FROM scheduled_post_runs WHERE guild_id=? ORDER BY attempted_at DESC LIMIT 250').bind(guildId).all()]);return json({posts:posts.results,templates:templates.results,runs:runs.results});}
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
      for(const item of items.slice(0,100)){if(!item.channel_id||!item.content||!Number(item.scheduled_for))continue;const roleId=String(item.ping_role_id||'')||null;const message=String(item.content);const recurrence=normalizeRecurrence(item.recurrence_rule);if(item.recurrence_rule&&!recurrence)return json({error:'invalid_recurrence',detail:'Choose once, daily, weekly, every two weeks, or monthly.'},400);const transportPrefix=roleId?`<@&${roleId}> `:'';if(transportPrefix.length+message.length>2000)return json({error:'message_too_long',detail:'Discord messages cannot exceed 2,000 characters, including the selected role mention.'},400);const contentJson={content:message,ping_role_id:roleId,ping_role_name:roleId?mentionableRoles.get(roleId)||null:null};const r=await env.DB.prepare('INSERT INTO scheduled_posts(guild_id,channel_id,content_json,timezone,scheduled_for,recurrence_rule,status,created_by,created_at,updated_at,paused,name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(guildId,String(item.channel_id),JSON.stringify(contentJson),String(item.timezone||'UTC'),Number(item.scheduled_for),recurrence,'queued',actorId,now,now,0,item.name||null).run();ids.push(Number(r.meta.last_row_id));}return json({ok:true,ids});
    }
    if(op==='edit'){
      const id=Number(body.id),post=await env.DB.prepare('SELECT id,status FROM scheduled_posts WHERE id=? AND guild_id=?').bind(id,guildId).first<any>();if(!post)return json({error:'not_found'},404);if(post.status==='sending')return json({error:'post_in_flight',detail:'This post is being delivered and cannot be edited right now.'},409);
      if(!body.channel_id||!body.content||!Number(body.scheduled_for))return json({error:'invalid_post',detail:'Choose a channel, message, and future time.'},400);
      const roleId=String(body.ping_role_id||'')||null,recurrence=normalizeRecurrence(body.recurrence_rule);if(body.recurrence_rule&&!recurrence)return json({error:'invalid_recurrence',detail:'Choose once, daily, weekly, every two weeks, or monthly.'},400);
      const resources=await loadGuildResources(env,guildId,{channels:true,roles:Boolean(roleId)});if(!resources.ok)return json(resources,resources.status);const channelFailure=validateChannelIds(resources,[body.channel_id]);if(channelFailure)return json(channelFailure,channelFailure.status);const roleFailure=validateRoleIds(resources,[roleId].filter(Boolean),{mentionable:true});if(roleFailure)return json(roleFailure,409);
      const message=String(body.content),prefix=roleId?`<@&${roleId}> `:'';if(prefix.length+message.length>2000)return json({error:'message_too_long',detail:'Discord messages cannot exceed 2,000 characters, including the selected role mention.'},400);
      const role=roleId?resources.roles.get(roleId):null;const contentJson={content:message,ping_role_id:roleId,ping_role_name:roleId?role?.name||null:null};
      await env.DB.prepare("UPDATE scheduled_posts SET name=?,channel_id=?,content_json=?,timezone=?,scheduled_for=?,recurrence_rule=?,status='queued',paused=0,dispatch_attempts=0,dispatch_lease_until=NULL,updated_at=? WHERE id=? AND guild_id=?").bind(String(body.name||'Scheduled post').slice(0,100),String(body.channel_id),JSON.stringify(contentJson),String(body.timezone||'UTC'),Number(body.scheduled_for),recurrence,now,id,guildId).run();return json({ok:true,id});
    }
    if(op==='make_role_mentionable'){
      const roleId=String(body.role_id||'');if(!/^\d+$/.test(roleId))return json({error:'invalid_role',detail:'Choose a role first.'},400);const resources=await loadGuildResources(env,guildId,{channels:false,roles:true});if(!resources.ok)return json(resources,resources.status);const role=resources.roles.get(roleId);if(!role||role.name==='@everyone'||role.managed)return json({error:'role_unavailable',detail:'That role is missing, managed by Discord, or cannot be edited by Orbit.'},400);if(role.mentionable)return json({ok:true,already:true});const member=await discord(env,`/guilds/${guildId}/members/${env.DISCORD_CLIENT_ID}`);if(!member.ok)return json({error:'bot_member_unavailable',detail:'Orbit could not verify its role position in this server.'},409);const botTop=botTopRolePosition([...resources.roles.values()],await member.json<any>());if(Number(role.position||0)>=botTop)return json({error:'role_hierarchy',detail:'Move Orbit’s highest role above the selected role in Discord, then try again.'},400);const response=await discord(env,`/guilds/${guildId}/roles/${roleId}`,{method:'PATCH',body:JSON.stringify({mentionable:true})});if(!response.ok)return json({error:'role_update_failed',detail:`Discord rejected the role update (HTTP ${response.status}).`},400);return json({ok:true});
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

function normalizeRecurrence(value:unknown):'daily'|'weekly'|'biweekly'|'monthly'|null{const rule=String(value||'');return rule==='daily'||rule==='weekly'||rule==='biweekly'||rule==='monthly'?rule:null;}
