export function shouldHandleAutomationMessage(event){
  return Boolean(event?.guild_id&&event?.author?.id&&!event.author.bot&&!event.webhook_id);
}

export function automationConditionMatches(condition,context){
  if(!condition||typeof condition!=='object')return false;
  if(condition.type==='channel_is')return context.channel_id===condition.channel_id;
  if(condition.type==='user_is')return context.user_id===condition.user_id;
  if(condition.type==='has_role')return (context.role_ids||[]).includes(condition.role_id);
  return false;
}

export function discordActionSucceeded(status){
  return Number.isInteger(status)&&status>=200&&status<300;
}
