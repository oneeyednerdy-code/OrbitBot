import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { json } from '../../http/responses';
import { recordSystemError } from '../../repositories/errors';

type TemplateRole={name:string;aliases:string[]};
const ROLE_TEMPLATES:Record<string,{roles:TemplateRole[]}>= {
  pronouns:{roles:[templateRole('He/Him','he him','he/him pronouns'),templateRole('She/Her','she her','she/her pronouns'),templateRole('They/Them','they them','they/them pronouns'),templateRole('He/They','he they'),templateRole('She/They','she they'),templateRole('It/Its','it its'),templateRole('Neopronouns','neo pronouns'),templateRole('Any Pronouns','any pronouns'),templateRole('Ask Me','ask me','ask pronouns')]},
  notifications:{roles:[templateRole('Stream Alerts','live alerts','stream notifications'),templateRole('Event Alerts','events','event notifications'),templateRole('Community Updates','announcements','updates'),templateRole('Giveaways','giveaway alerts')]},
  interests:{roles:[templateRole('Gaming','games'),templateRole('TTRPG','tabletop','tabletop rpg'),templateRole('Content Creation','creator','streamer'),templateRole('Tech','technology'),templateRole('Art','artist')]},
  regions:{roles:[templateRole('Americas','north america','south america'),templateRole('Europe','european'),templateRole('Asia-Pacific','asia pacific','apac'),templateRole('Oceania','australia','new zealand')]},
};

export async function rolesApi(request:Request,env:Env,guildId:string,actorId:string):Promise<Response>{
  if(request.method==='GET'){
    const panels=await env.DB.prepare('SELECT * FROM role_panels WHERE guild_id=? ORDER BY created_at DESC').bind(guildId).all<any>();
    for(const panel of panels.results)panel.items=(await env.DB.prepare('SELECT * FROM role_panel_items WHERE panel_id=? ORDER BY sort_order,id').bind(panel.id).all<any>()).results;
    return json({panels:panels.results});
  }
  if(request.method==='POST')return createPanel(request,env,guildId,actorId);
  if(request.method==='DELETE')return deletePanel(request,env,guildId);
  return json({error:'method_not_allowed'},405);
}

async function createPanel(request:Request,env:Env,guildId:string,actorId:string):Promise<Response>{
  const body=await request.json<any>(),name=String(body.name||'').trim().slice(0,80),channelId=String(body.channel_id||''),message=String(body.message||`**${name}**\nChoose the roles you want.`);
  if(!channelId||!name||!Array.isArray(body.items))return json({error:'invalid_panel',detail:'Choose a name, channel, and at least one role.'},400);
  if(message.length>2000)return json({error:'message_too_long',detail:'The panel message must be 2,000 characters or fewer.'},400);
  const [rolesResponse,memberResponse,channelsResponse]=await Promise.all([discord(env,`/guilds/${guildId}/roles`),discord(env,`/guilds/${guildId}/members/${env.DISCORD_CLIENT_ID}`),discord(env,`/guilds/${guildId}/channels`)]);
  if(!rolesResponse.ok||!memberResponse.ok||!channelsResponse.ok)return json({error:'discord_validation_failed',detail:'Orbit could not validate the server roles, bot hierarchy, and destination channel.'},502);
  const roles=await rolesResponse.json<any[]>(),botMember=await memberResponse.json<any>(),channels=await channelsResponse.json<any[]>();
  if(!channels.some(channel=>String(channel.id)===channelId&&(channel.type===0||channel.type===5)))return json({error:'invalid_channel',detail:'Choose a text or announcement channel from this server.'},400);
  const botTop=Math.max(...roles.filter(role=>botMember.roles?.includes(role.id)).map(role=>Number(role.position)),0);
  const selected=new Map<string,{role_id:string;label:string;emoji:string|null}>();
  for(const raw of body.items){const roleId=String(raw.role_id||'');if(/^\d+$/.test(roleId)&&!selected.has(roleId))selected.set(roleId,{role_id:roleId,label:String(raw.label||'Role').slice(0,80),emoji:raw.emoji?String(raw.emoji).slice(0,64):null});}
  for(const item of selected.values()){const role=roles.find(candidate=>String(candidate.id)===item.role_id);if(!role||role.name==='@everyone'||role.managed||Number(role.position)>=botTop)return json({error:'role_not_assignable',detail:`Orbit cannot assign ${role?.name||item.label}. Move Orbit above that role or choose another role.`},400);}

  const template=ROLE_TEMPLATES[String(body.template_key||'')];
  if(body.create_missing_template_roles){
    if(!template)return json({error:'invalid_template',detail:'Choose a valid quick template before creating missing roles.'},400);
    const templateRoleIds=new Set(template.roles.map(definition=>findTemplateRole(roles,definition)?.id).filter(Boolean).map(String));
    if([...selected.keys()].filter(roleId=>!templateRoleIds.has(roleId)).length+template.roles.length>10)return json({error:'too_many_roles',detail:'This template plus the extra selected roles would exceed the 10-role panel limit.'},400);
    if(!hasManageRoles(roles,botMember.roles||[],guildId))return json({error:'missing_manage_roles',detail:'Orbit needs Manage Roles permission to create missing template roles.'},403);
    let createdCount=0;
    for(const definition of template.roles){
      let role=findTemplateRole(roles,definition);
      if(!role){
        const created=await discord(env,`/guilds/${guildId}/roles`,{method:'POST',body:JSON.stringify({name:definition.name,mentionable:false,hoist:false})});
        if(!created.ok){let detail:any={};try{detail=await created.json<any>()}catch{}const requestId=await recordSystemError(env,guildId,'/guilds/:guild/roles','POST',created.status,'template_role_create_failed',detail);return json({error:'template_role_create_failed',detail:`Discord could not create ${definition.name}.${createdCount?' Some earlier template roles were created successfully.':''}`,request_id:requestId},400);}
        role=await created.json<any>();roles.push(role);createdCount++;
      }
      selected.set(String(role.id),{role_id:String(role.id),label:definition.name,emoji:null});
    }
  }

  const items=[...selected.values()];
  if(items.length<1)return json({error:'no_roles_selected',detail:'Choose at least one existing role or enable creation of the missing template roles.'},400);
  if(items.length>10)return json({error:'too_many_roles',detail:'Role panels can contain up to 10 roles.'},400);
  for(const item of items){const role=roles.find(candidate=>String(candidate.id)===item.role_id);if(!role||role.name==='@everyone'||role.managed||Number(role.position)>=botTop)return json({error:'role_not_assignable',detail:`Orbit cannot assign ${role?.name||item.label}. Move Orbit above that role or choose another role.`},400);}

  const type=body.interaction_type==='select'?'select':'button',now=Date.now();
  const inserted=await env.DB.prepare('INSERT INTO role_panels(guild_id,channel_id,name,interaction_type,config_json,enabled,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(guildId,channelId,name,type,JSON.stringify({template_key:body.template_key||null}),1,actorId,now,now).run();
  const panelId=Number(inserted.meta.last_row_id);
  for(let index=0;index<items.length;index++){const item=items[index];await env.DB.prepare('INSERT INTO role_panel_items(panel_id,role_id,label,emoji,sort_order) VALUES(?,?,?,?,?)').bind(panelId,item.role_id,item.label,item.emoji,index).run();}
  const components=type==='select'?[{type:1,components:[{type:3,custom_id:`orbit_roles:${panelId}`,min_values:0,max_values:items.length,placeholder:'Choose your roles',options:items.map(item=>({label:item.label,value:item.role_id,...(item.emoji?{emoji:{name:item.emoji}}:{})}))}]}]:chunk(items,5).map(row=>({type:1,components:row.map(item=>({type:2,style:2,label:item.label,custom_id:`orbit_role:${panelId}:${item.role_id}`,...(item.emoji?{emoji:{name:item.emoji}}:{})}))}));
  const sent=await discord(env,`/channels/${channelId}/messages`,{method:'POST',body:JSON.stringify({content:message,components,allowed_mentions:{parse:[]}})});
  if(sent.ok){const discordMessage=await sent.json<any>();await env.DB.prepare('UPDATE role_panels SET message_id=? WHERE id=?').bind(discordMessage.id,panelId).run();return json({ok:true,panel_id:panelId,message_id:discordMessage.id});}
  let detail:any={};try{detail=await sent.json<any>()}catch{}
  await env.DB.batch([env.DB.prepare('DELETE FROM role_panel_items WHERE panel_id=?').bind(panelId),env.DB.prepare('DELETE FROM role_panels WHERE id=? AND guild_id=?').bind(panelId,guildId)]);
  const requestId=await recordSystemError(env,guildId,'/channels/:channel/messages','POST',sent.status,'role_panel_post_failed',detail);
  return json({error:'role_panel_post_failed',status:sent.status,detail:detail?.message||'Discord would not post the role panel.',request_id:requestId},400);
}

async function deletePanel(request:Request,env:Env,guildId:string):Promise<Response>{
  const id=Number(new URL(request.url).searchParams.get('id'));if(!id)return json({error:'invalid_id'},400);
  const panel=await env.DB.prepare('SELECT id,channel_id,message_id,name FROM role_panels WHERE id=? AND guild_id=?').bind(id,guildId).first<any>();
  if(!panel)return json({error:'panel_not_found'},404);
  if(panel.message_id&&panel.channel_id){
    const removed=await discord(env,`/channels/${panel.channel_id}/messages/${panel.message_id}`,{method:'DELETE'});
    if(!removed.ok&&removed.status!==404){let detail:any={};try{detail=await removed.json<any>()}catch{}const requestId=await recordSystemError(env,guildId,'/channels/:channel/messages/:message','DELETE',removed.status,'role_panel_message_delete_failed',detail);return json({error:'role_panel_message_delete_failed',status:removed.status,detail:detail?.message||'Discord would not remove the role panel message.',request_id:requestId},400);}
  }
  await env.DB.batch([env.DB.prepare('DELETE FROM role_panel_items WHERE panel_id IN (SELECT id FROM role_panels WHERE id=? AND guild_id=?)').bind(id,guildId),env.DB.prepare('DELETE FROM role_panels WHERE id=? AND guild_id=?').bind(id,guildId)]);
  return json({ok:true,roles_preserved:true,message_removed:Boolean(panel.message_id)});
}

function templateRole(name:string,...aliases:string[]):TemplateRole{return {name,aliases}}
function findTemplateRole(roles:any[],definition:TemplateRole):any{return roles.find(role=>[definition.name,...definition.aliases].map(normalize).includes(normalize(role.name)))}
function normalize(value:string):string{return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function hasManageRoles(roles:any[],memberRoleIds:string[],guildId:string):boolean{const permissions=roles.filter(role=>role.id===guildId||memberRoleIds.includes(role.id)).reduce((value,role)=>value|BigInt(role.permissions||0),0n);return (permissions&8n)===8n||(permissions&268435456n)===268435456n;}
function chunk<T>(items:T[],size:number){const output:T[][]=[];for(let index=0;index<items.length;index+=size)output.push(items.slice(index,index+size));return output;}
