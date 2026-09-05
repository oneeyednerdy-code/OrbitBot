import type { Env } from '../../types';
import { json } from '../../http/responses';

export async function applicationsApi(request:Request,env:Env,guildId:string):Promise<Response>{
  const url=new URL(request.url);
  if(request.method==='GET'){
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
      return json({ok:true,id:Number(result.meta.last_row_id)});
    }
    if(body.op==='update_form'){
      const id=Number(body.id);
      if(!Number.isInteger(id)||id<=0)return json({error:'invalid_form_id'},400);
      if(!String(body.name||'').trim())return json({error:'name_required'},400);
      const existing=await env.DB.prepare('SELECT id,staff_role_id,destination_channel_id,enabled FROM application_forms WHERE id=? AND guild_id=?').bind(id,guildId).first<any>();
      if(!existing)return json({error:'form_not_found'},404);
      const fields=normalizeFields(body.fields);
      if(fields.error)return json({error:fields.error},400);
      await env.DB.prepare(`UPDATE application_forms SET name=?,description=?,fields_json=?,staff_role_id=?,destination_channel_id=?,enabled=?,updated_at=?
        WHERE id=? AND guild_id=?`)
        .bind(String(body.name).trim().slice(0,120),cleanNullable(body.description,2000),JSON.stringify(fields.value),body.staff_role_id===undefined?existing.staff_role_id:(body.staff_role_id||null),body.destination_channel_id===undefined?existing.destination_channel_id:(body.destination_channel_id||null),body.enabled===undefined?Number(existing.enabled||0):(body.enabled===false?0:1),now,id,guildId).run();
      return json({ok:true,id});
    }
    if(body.op==='review'){
      await env.DB.prepare('UPDATE application_submissions SET status=?,staff_notes=?,updated_at=? WHERE id=? AND guild_id=?')
        .bind(['approved','denied','pending'].includes(body.status)?body.status:'pending',body.staff_notes||null,now,Number(body.id),guildId).run();
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
    await env.DB.prepare('DELETE FROM application_forms WHERE id=? AND guild_id=?').bind(id,guildId).run();
    return json({ok:true});
  }
  return json({error:'method_not_allowed'},405);
}

function normalizeFields(input:any):{value:any[];error?:string}{
  if(!Array.isArray(input))return {value:[]};
  const raw=input.map((field:any)=>String(field?.label||'').trim()).filter(Boolean);
  if(raw.length>10)return {value:[],error:'question_limit_10'};
  const value=raw.map((label:string,index:number)=>({id:`q${index+1}`,label:label.slice(0,240),type:'text'}));
  return {value};
}
function cleanNullable(value:any,max:number){const v=String(value||'').trim();return v?v.slice(0,max):null;}
