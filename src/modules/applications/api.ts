import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { sendDiscordMessage,safeMessageBody } from '../../discord/messages';
import { json } from '../../http/responses';
import { audit } from '../../repositories/audit';
import { recordSystemError } from '../../repositories/errors';

export async function applicationsApi(request:Request,env:Env,guildId:string,actorId:string):Promise<Response>{
  const url=new URL(request.url);
  if(request.method==='GET'){
    await cleanupExpiredSessions(env);
    const [forms,subs]=await Promise.all([
      env.DB.prepare('SELECT * FROM application_forms WHERE guild_id=? ORDER BY created_at DESC').bind(guildId).all(),
      env.DB.prepare('SELECT * FROM application_submissions WHERE guild_id=? ORDER BY created_at DESC LIMIT 100').bind(guildId).all(),
    ]);
    return json({forms:forms.results,submissions:subs.results});
  }
  if(request.method==='POST'){
    const body=await request.json<any>();
    const now=Date.now();
    if(body.op==='create_form'){
      if(!String(body.name||'').trim())return json({error:'name_required'},400);
      const fields=normalizeFields(body.fields);
      if(fields.error)return json({error:fields.error},400);
      const result=await env.DB.prepare(`INSERT INTO application_forms(guild_id,name,description,fields_json,staff_role_id,destination_channel_id,enabled,created_at,updated_at)
        VALUES(?,?,?,?,?,?,1,?,?)`)
        .bind(guildId,String(body.name).trim().slice(0,120),cleanNullable(body.description,2000),JSON.stringify(fields.value),body.staff_role_id||null,body.destination_channel_id||null,now,now).run();
      const id=Number(result.meta.last_row_id);
      await audit(env,guildId,null,'application_form_created',{form_id:id,question_count:fields.value.length},actorId);
      return json({ok:true,id});
    }
    if(body.op==='update_form'){
      const id=Number(body.id);
      if(!Number.isInteger(id)||id<=0)return json({error:'invalid_form_id'},400);
      if(!String(body.name||'').trim())return json({error:'name_required'},400);
      const existing=await env.DB.prepare('SELECT * FROM application_forms WHERE id=? AND guild_id=?').bind(id,guildId).first<any>();
      if(!existing)return json({error:'form_not_found'},404);
      const fields=normalizeFields(body.fields);
      if(fields.error)return json({error:fields.error},400);
      await env.DB.prepare(`UPDATE application_forms SET name=?,description=?,fields_json=?,staff_role_id=?,destination_channel_id=?,enabled=?,updated_at=?
        WHERE id=? AND guild_id=?`)
        .bind(String(body.name).trim().slice(0,120),cleanNullable(body.description,2000),JSON.stringify(fields.value),body.staff_role_id===undefined?existing.staff_role_id:(body.staff_role_id||null),body.destination_channel_id===undefined?existing.destination_channel_id:(body.destination_channel_id||null),body.enabled===undefined?Number(existing.enabled||0):(body.enabled===false?0:1),now,id,guildId).run();
      await env.DB.prepare('DELETE FROM application_form_sessions WHERE form_id=? AND guild_id=?').bind(id,guildId).run();
      await audit(env,guildId,null,'application_form_updated',{form_id:id,question_count:fields.value.length},actorId);
      return json({ok:true,id});
    }
    if(body.op==='post_panel')return postPanel(env,guildId,actorId,body);
    if(body.op==='delete_panel')return deletePanel(env,guildId,actorId,Number(body.id));
    if(body.op==='review'){
      const id=Number(body.id);
      const status=['approved','denied','pending'].includes(body.status)?body.status:'pending';
      await env.DB.prepare('UPDATE application_submissions SET status=?,staff_notes=?,updated_at=? WHERE id=? AND guild_id=?')
        .bind(status,body.staff_notes||null,now,id,guildId).run();
      await audit(env,guildId,null,'application_submission_reviewed',{submission_id:id,status},actorId);
      return json({ok:true});
    }
    if(body.op==='submit'){
      const form=await env.DB.prepare('SELECT id,fields_json FROM application_forms WHERE id=? AND guild_id=? AND enabled=1').bind(Number(body.form_id),guildId).first<any>();
      if(!form)return json({error:'form_not_found'},404);
      let questions:any[]=[];try{questions=JSON.parse(form.fields_json||'[]')}catch{}
      const answers=body.answers&&typeof body.answers==='object'?body.answers:{};
      const allowed=new Set(questions.slice(0,10).map(q=>String(q.id)));
      const safeAnswers:Object=Object.fromEntries(Object.entries(answers).filter(([key])=>allowed.has(key)).slice(0,10).map(([key,value])=>[key,String(value??'').slice(0,4000)]));
      const result=await env.DB.prepare(`INSERT INTO application_submissions(form_id,guild_id,user_id,answers_json,status,created_at,updated_at)
        VALUES(?,?,?,?, 'pending',?,?)`).bind(Number(body.form_id),guildId,body.user_id||null,JSON.stringify(safeAnswers),now,now).run();
      return json({ok:true,id:Number(result.meta.last_row_id)});
    }
    return json({error:'unsupported_application_operation'},400);
  }
  if(request.method==='DELETE'){
    const id=Number(url.searchParams.get('id'));
    if(!Number.isInteger(id)||id<=0)return json({error:'invalid_form_id'},400);
    const form=await env.DB.prepare('SELECT panel_channel_id,panel_message_id FROM application_forms WHERE id=? AND guild_id=?').bind(id,guildId).first<any>();
    if(form?.panel_channel_id&&form?.panel_message_id){try{await discord(env,`/channels/${form.panel_channel_id}/messages/${form.panel_message_id}`,{method:'DELETE'})}catch{}}
    await env.DB.batch([
      env.DB.prepare('DELETE FROM application_form_sessions WHERE form_id=? AND guild_id=?').bind(id,guildId),
      env.DB.prepare('DELETE FROM application_forms WHERE id=? AND guild_id=?').bind(id,guildId),
    ]);
    await audit(env,guildId,null,'application_form_deleted',{form_id:id},actorId);
    return json({ok:true});
  }
  return json({error:'method_not_allowed'},405);
}

async function postPanel(env:Env,guildId:string,actorId:string,body:any):Promise<Response>{
  const id=Number(body.id),channelId=String(body.channel_id||'');
  if(!Number.isInteger(id)||id<=0)return json({error:'invalid_form_id',detail:'Choose a saved application or appeal form.'},400);
  if(!/^\d+$/.test(channelId))return json({error:'invalid_channel',detail:'Choose a Discord channel for the form panel.'},400);
  const form=await env.DB.prepare('SELECT * FROM application_forms WHERE id=? AND guild_id=?').bind(id,guildId).first<any>();
  if(!form)return json({error:'form_not_found',detail:'That form no longer exists.'},404);
  const fields=normalizeFields(parseJson(form.fields_json));
  if(!fields.value.length)return json({error:'questions_required',detail:'Add at least one question before posting this form.'},400);

  const channelResponse=await discord(env,`/channels/${channelId}`);
  if(!channelResponse.ok)return json({error:'channel_unavailable',detail:'Orbit cannot access that channel. Check View Channel and Send Messages permissions.'},409);
  const channel=await channelResponse.json<any>();
  if(String(channel.guild_id)!==guildId||![0,5].includes(Number(channel.type)))return json({error:'invalid_channel',detail:'Choose a text or announcement channel from this server.'},400);

  const title=String(body.panel_title||form.panel_title||form.name||'Application').trim().slice(0,120)||String(form.name).slice(0,120);
  const description=String(body.panel_description??form.panel_description??form.description??'').trim().slice(0,1600);
  const buttonLabel=String(body.panel_button_label||form.panel_button_label||defaultButtonLabel(form.name)).trim().slice(0,80)||'Open Form';
  const content=[`**${title}**`,description].filter(Boolean).join('\n\n').slice(0,2000);
  const payload=safeMessageBody({content,components:[{type:1,components:[{type:2,style:1,label:buttonLabel,custom_id:`orbit_application_open:${id}`}]}]});

  let messageId:string|null=null;
  let mode:'created'|'updated'|'repaired'='created';
  if(String(form.panel_channel_id||'')===channelId&&form.panel_message_id){
    const updated=await discord(env,`/channels/${channelId}/messages/${form.panel_message_id}`,{method:'PATCH',body:JSON.stringify(payload)});
    if(updated.ok){messageId=String((await updated.json<any>()).id);mode='updated';}
    else if(updated.status!==404)return panelFailure(env,guildId,updated,'application_panel_update_failed');
    else mode='repaired';
  }
  if(!messageId){
    const sent=await sendDiscordMessage(env,channelId,{content,components:[{type:1,components:[{type:2,style:1,label:buttonLabel,custom_id:`orbit_application_open:${id}`}]}]});
    if(!sent.ok)return panelFailure(env,guildId,sent,'application_panel_post_failed');
    messageId=String((await sent.json<any>()).id);
    if(form.panel_channel_id&&form.panel_message_id&&(String(form.panel_channel_id)!==channelId||String(form.panel_message_id)!==messageId)){
      try{await discord(env,`/channels/${form.panel_channel_id}/messages/${form.panel_message_id}`,{method:'DELETE'})}catch{}
    }
  }

  const now=Date.now();
  await env.DB.prepare(`UPDATE application_forms SET panel_channel_id=?,panel_message_id=?,panel_title=?,panel_description=?,panel_button_label=?,panel_posted_at=?,updated_at=? WHERE id=? AND guild_id=?`)
    .bind(channelId,messageId,title,description||null,buttonLabel,now,now,id,guildId).run();
  await audit(env,guildId,null,'application_panel_posted',{form_id:id,channel_id:channelId,message_id:messageId,mode,question_count:fields.value.length},actorId);
  return json({ok:true,form_id:id,channel_id:channelId,message_id:messageId,mode});
}

async function deletePanel(env:Env,guildId:string,actorId:string,id:number):Promise<Response>{
  if(!Number.isInteger(id)||id<=0)return json({error:'invalid_form_id'},400);
  const form=await env.DB.prepare('SELECT panel_channel_id,panel_message_id FROM application_forms WHERE id=? AND guild_id=?').bind(id,guildId).first<any>();
  if(!form)return json({error:'form_not_found'},404);
  let discordStatus:number|null=null;
  if(form.panel_channel_id&&form.panel_message_id){
    try{const removed=await discord(env,`/channels/${form.panel_channel_id}/messages/${form.panel_message_id}`,{method:'DELETE'});discordStatus=removed.status;if(!removed.ok&&removed.status!==404)return panelFailure(env,guildId,removed,'application_panel_delete_failed');}catch{}
  }
  await env.DB.prepare('UPDATE application_forms SET panel_channel_id=NULL,panel_message_id=NULL,panel_posted_at=NULL,updated_at=? WHERE id=? AND guild_id=?').bind(Date.now(),id,guildId).run();
  await audit(env,guildId,null,'application_panel_deleted',{form_id:id,channel_id:form.panel_channel_id||null,message_id:form.panel_message_id||null,discord_status:discordStatus},actorId);
  return json({ok:true});
}

async function panelFailure(env:Env,guildId:string,response:Response,code:string):Promise<Response>{
  let detail:any={};try{detail=await response.clone().json<any>()}catch{}
  const requestId=await recordSystemError(env,guildId,'/channels/:channel/messages','POST',response.status,code,detail);
  return json({error:code,detail:detail?.message||`Discord returned HTTP ${response.status}.`,request_id:requestId},response.status===403?403:502);
}

function normalizeFields(input:any):{value:any[];error?:string}{
  if(!Array.isArray(input))return {value:[]};
  const raw=input.map((field:any)=>String(field?.label||'').trim()).filter(Boolean);
  if(raw.length>10)return {value:[],error:'question_limit_10'};
  const value=raw.map((label:string,index:number)=>({id:`q${index+1}`,label:label.slice(0,240),type:'text'}));
  return {value};
}
function parseJson(raw:any):any[]{try{const value=Array.isArray(raw)?raw:JSON.parse(raw||'[]');return Array.isArray(value)?value:[]}catch{return []}}
function cleanNullable(value:any,max:number){const v=String(value||'').trim();return v?v.slice(0,max):null;}
function defaultButtonLabel(name:any){return /appeal/i.test(String(name||''))?'Submit Appeal':/application|apply|mod/i.test(String(name||''))?'Apply Now':'Open Form'}
async function cleanupExpiredSessions(env:Env):Promise<void>{try{await env.DB.prepare('DELETE FROM application_form_sessions WHERE expires_at<?').bind(Date.now()).run()}catch{}}
