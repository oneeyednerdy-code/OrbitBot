import type { Env } from '../../types';
import { addRole, discord, removeRole } from '../../discord/client';
import { sendDiscordMessage } from '../../discord/messages';
import { audit } from '../../repositories/audit';
import { automationConditionMatches, discordActionSucceeded } from './policy.js';

type AutomationContext={event_id?:string;user_id?:string;channel_id?:string;role_ids?:string[];creator?:string;platform?:string;title?:string;url?:string;vod_url?:string};
type AutomationAction={type?:string;channel_id?:string;content?:string;user_id?:string;role_id?:string};

export async function runAutomations(env:Env,guildId:string,triggerType:string,context:AutomationContext):Promise<void>{
  if(!guildId)return;
  const security=await env.DB.prepare('SELECT lockdown_active FROM security_configs WHERE guild_id=?').bind(guildId).first<{lockdown_active?:number}>();
  if(security?.lockdown_active)return;

  const rows=(await env.DB.prepare('SELECT id,trigger_json,conditions_json,actions_json FROM automations WHERE guild_id=? AND enabled=1').bind(guildId).all<any>()).results;
  for(const row of rows){
    const trigger=parse(row.trigger_json,{});
    if(trigger.type!==triggerType)continue;
    const conditions=parse(row.conditions_json,[]);
    if(!Array.isArray(conditions)||!conditions.every(condition=>automationConditionMatches(condition,context)))continue;
    const actions=parse(row.actions_json,[]);
    if(!Array.isArray(actions)||actions.length===0)continue;

    let ok=true;
    const results:Array<Record<string,unknown>>=[];
    for(const action of actions.slice(0,10)){
      try{results.push(await execute(env,guildId,action,context));}
      catch(error){ok=false;results.push({type:String(action?.type||'unknown'),error:error instanceof Error?error.message:String(error)});}
    }
    const status=ok?'success':'partial';
    await env.DB.prepare('INSERT INTO automation_runs(automation_id,guild_id,trigger_type,status,detail_json,ran_at) VALUES(?,?,?,?,?,?)')
      .bind(row.id,guildId,triggerType,status,JSON.stringify({event_id:context.event_id||null,results}),Date.now()).run();
    await audit(env,guildId,context.user_id||null,'automation_run',{automation_id:row.id,trigger_type:triggerType,status});
  }
}

async function execute(env:Env,guildId:string,action:AutomationAction,context:AutomationContext):Promise<Record<string,unknown>>{
  let response:Response;
  if(action.type==='send_message'){
    const channel=action.channel_id||context.channel_id;
    const content=renderTemplate(String(action.content||''),context).trim().slice(0,2000);
    if(!channel||!content)throw new Error('automation_message_incomplete');
    response=await sendDiscordMessage(env,channel,{content,pingUserIds:context.user_id?[context.user_id]:[]});
  }else if(action.type==='add_role'){
    const userId=action.user_id||context.user_id;
    if(!userId||!action.role_id)throw new Error('automation_add_role_incomplete');
    response=await addRole(env,guildId,userId,action.role_id);
  }else if(action.type==='remove_role'){
    const userId=action.user_id||context.user_id;
    if(!userId||!action.role_id)throw new Error('automation_remove_role_incomplete');
    response=await removeRole(env,guildId,userId,action.role_id);
  }else if(action.type==='ban'){
    const userId=action.user_id||context.user_id;
    if(!userId)throw new Error('automation_ban_incomplete');
    response=await discord(env,`/guilds/${guildId}/bans/${userId}`,{method:'PUT',body:JSON.stringify({delete_message_seconds:0})});
  }else throw new Error('automation_action_unsupported');

  if(!discordActionSucceeded(response.status)){
    let code='unknown';
    try{const detail=await response.clone().json<any>();code=String(detail?.code||detail?.message||'unknown').slice(0,100);}catch{}
    throw new Error(`discord_${response.status}_${code}`);
  }
  return {type:action.type,status:response.status};
}

function parse(raw:unknown,fallback:any):any{try{return typeof raw==='string'?JSON.parse(raw):raw??fallback}catch{return fallback}}

function renderTemplate(value:string,context:AutomationContext):string{
  const user=context.user_id?`<@${context.user_id}>`:'';
  return value.replaceAll('{user}',user).replaceAll('{creator}',context.creator||'').replaceAll('{platform}',context.platform||'').replaceAll('{title}',context.title||'').replaceAll('{url}',context.url||'').replaceAll('{vod_url}',context.vod_url||'');
}
