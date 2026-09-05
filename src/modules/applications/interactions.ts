import type { Env } from '../../types';
import { audit } from '../../repositories/audit';

const SESSION_TTL_MS=30*60_000;

type FormField={id:string;label:string;type?:string};

export async function handleApplicationInteraction(env:Env,interaction:any):Promise<any|null>{
  const custom=String(interaction.data?.custom_id||'');
  const guildId=String(interaction.guild_id||'');
  const userId=String(interaction.member?.user?.id||interaction.user?.id||'');
  if(!custom.startsWith('orbit_application_'))return null;
  if(!guildId||!userId)return ephemeral('Orbit could not identify this server member.');

  if(interaction.type===3&&custom.startsWith('orbit_application_open:')){
    const formId=positiveId(custom.split(':')[1]);
    if(!formId)return ephemeral('That form is not available.');
    const form=await loadForm(env,guildId,formId);
    if(!form)return ephemeral('That form is no longer available.');
    const fields=parseFields(form.fields_json);
    if(!fields.length)return ephemeral('This form does not have any questions yet.');
    return modal(form,fields,1,null);
  }

  if(interaction.type===5&&custom.startsWith('orbit_application_modal:')){
    const parts=custom.split(':');
    const formId=positiveId(parts[1]);
    const page=Number(parts[2]||1);
    const sessionId=parts[3]||null;
    if(!formId||![1,2].includes(page))return ephemeral('That form page is invalid.');
    const form=await loadForm(env,guildId,formId);
    if(!form)return ephemeral('That form is no longer available.');
    const fields=parseFields(form.fields_json);
    const answers=modalValues(interaction.data?.components);

    if(fields.length>5&&page===1){
      const safe=filterAnswers(fields.slice(0,5),answers);
      const id=String(interaction.id||crypto.randomUUID());
      const now=Date.now();
      await env.DB.prepare(`INSERT INTO application_form_sessions(session_id,form_id,guild_id,user_id,answers_json,expires_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET answers_json=excluded.answers_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
        .bind(id,formId,guildId,userId,JSON.stringify(safe),now+SESSION_TTL_MS,now,now).run();
      await cleanupExpiredSessions(env);
      return {type:4,data:{content:'Page 1 of 2 saved. Continue when you are ready for questions 6–10.',flags:64,components:[{type:1,components:[{type:2,style:1,label:'Continue · Page 2 of 2',custom_id:`orbit_application_continue:${formId}:${id}`}]}]}};
    }

    if(fields.length>5&&page===2){
      if(!sessionId)return ephemeral('Your first page could not be found. Start the form again.');
      const session=await env.DB.prepare('SELECT * FROM application_form_sessions WHERE session_id=? AND form_id=? AND guild_id=? AND user_id=?').bind(sessionId,formId,guildId,userId).first<any>();
      if(!session||Number(session.expires_at||0)<Date.now()){
        if(session)await env.DB.prepare('DELETE FROM application_form_sessions WHERE session_id=?').bind(sessionId).run();
        return ephemeral('Your saved first page expired. Please start the form again.');
      }
      const first=safeObject(session.answers_json);
      const second=filterAnswers(fields.slice(5,10),answers);
      const result=await createSubmission(env,form,interaction,{...first,...second});
      await env.DB.prepare('DELETE FROM application_form_sessions WHERE session_id=?').bind(sessionId).run();
      return result;
    }

    return createSubmission(env,form,interaction,filterAnswers(fields.slice(0,5),answers));
  }

  if(interaction.type===3&&custom.startsWith('orbit_application_continue:')){
    const parts=custom.split(':');
    const formId=positiveId(parts[1]);
    const sessionId=parts[2]||'';
    if(!formId||!sessionId)return ephemeral('That continuation link is invalid.');
    const session=await env.DB.prepare('SELECT * FROM application_form_sessions WHERE session_id=? AND form_id=? AND guild_id=? AND user_id=?').bind(sessionId,formId,guildId,userId).first<any>();
    if(!session||Number(session.expires_at||0)<Date.now()){
      if(session)await env.DB.prepare('DELETE FROM application_form_sessions WHERE session_id=?').bind(sessionId).run();
      return ephemeral('Your saved first page expired. Please start the form again.');
    }
    const form=await loadForm(env,guildId,formId);
    if(!form)return ephemeral('That form is no longer available.');
    const fields=parseFields(form.fields_json);
    if(fields.length<=5)return ephemeral('This form no longer needs a second page. Please start it again.');
    return modal(form,fields,2,sessionId);
  }

  return null;
}

async function createSubmission(env:Env,form:any,interaction:any,answers:Record<string,string>):Promise<any>{
  const guildId=String(interaction.guild_id||'');
  const userId=String(interaction.member?.user?.id||interaction.user?.id||'');
  const interactionId=String(interaction.id||'')||null;
  const now=Date.now();
  let submissionId:number|null=null;
  try{
    const result=await env.DB.prepare(`INSERT INTO application_submissions(form_id,guild_id,user_id,answers_json,status,created_at,updated_at,interaction_id)
      VALUES(?,?,?,?, 'pending',?,?,?)`).bind(Number(form.id),guildId,userId,JSON.stringify(answers),now,now,interactionId).run();
    submissionId=Number(result.meta.last_row_id);
  }catch(error:any){
    if(interactionId){
      const existing=await env.DB.prepare('SELECT id FROM application_submissions WHERE interaction_id=? AND guild_id=?').bind(interactionId,guildId).first<any>();
      if(existing?.id)return ephemeral(`Your submission was already received as #${existing.id}.`);
    }
    throw error;
  }

  await audit(env,guildId,userId,'application_submitted',{form_id:Number(form.id),submission_id:submissionId});
  return ephemeral(`Submitted successfully. Your submission number is #${submissionId}.`);
}

function modal(form:any,fields:FormField[],page:1|2,sessionId:string|null):any{
  const offset=page===2?5:0;
  const pageFields=fields.slice(offset,offset+5);
  const totalPages=fields.length>5?2:1;
  const titleBase=String(form.name||'Application');
  const title=(totalPages===2?`${titleBase} · ${page}/2`:titleBase).slice(0,45);
  const customId=page===2?`orbit_application_modal:${form.id}:2:${sessionId}`:`orbit_application_modal:${form.id}:1`;
  return {type:9,data:{custom_id:customId.slice(0,100),title,components:pageFields.map((field,index)=>{
    const question=String(field.label||`Question ${offset+index+1}`).trim();
    return {type:18,label:(question.length<=45?question:`Question ${offset+index+1}`).slice(0,45),...(question.length>45?{description:question.slice(0,100)}:{}),component:{type:4,custom_id:String(field.id||`q${offset+index+1}`).slice(0,100),style:2,required:true,max_length:4000,placeholder:question.slice(0,100)}};
  })}};
}

async function loadForm(env:Env,guildId:string,formId:number):Promise<any>{
  return env.DB.prepare('SELECT * FROM application_forms WHERE id=? AND guild_id=? AND enabled=1').bind(formId,guildId).first<any>();
}
function parseFields(raw:any):FormField[]{try{const value=Array.isArray(raw)?raw:JSON.parse(raw||'[]');return Array.isArray(value)?value.slice(0,10).map((field:any,index:number)=>({id:String(field?.id||`q${index+1}`),label:String(field?.label||`Question ${index+1}`),type:String(field?.type||'text')})):[]}catch{return []}}
function modalValues(components:any):Record<string,string>{const values:Record<string,string>={};const visit=(component:any)=>{if(!component||typeof component!=='object')return;if(component.custom_id&&component.value!==undefined)values[String(component.custom_id)]=String(component.value||'').slice(0,4000);if(component.component)visit(component.component);if(Array.isArray(component.components))component.components.forEach(visit)};(Array.isArray(components)?components:[]).forEach(visit);return values}
function filterAnswers(fields:FormField[],answers:Record<string,string>):Record<string,string>{const allowed=new Set(fields.map(field=>field.id));return Object.fromEntries(Object.entries(answers).filter(([key])=>allowed.has(key)).slice(0,fields.length).map(([key,value])=>[key,String(value||'').slice(0,4000)]))}
function safeObject(raw:any):Record<string,string>{try{const parsed=typeof raw==='string'?JSON.parse(raw):raw;return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?Object.fromEntries(Object.entries(parsed).map(([k,v])=>[String(k),String(v??'').slice(0,4000)])):{};}catch{return {}}}
function positiveId(value:any):number|null{const id=Number(value);return Number.isInteger(id)&&id>0?id:null}
function ephemeral(content:string){return {type:4,data:{content:String(content).slice(0,2000),flags:64}}}
async function cleanupExpiredSessions(env:Env):Promise<void>{try{await env.DB.prepare('DELETE FROM application_form_sessions WHERE expires_at<?').bind(Date.now()).run()}catch{}}
