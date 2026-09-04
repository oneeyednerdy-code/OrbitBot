import type { Env, OrbitJob } from '../../types';
import { discord } from '../../discord/client';
import { audit } from '../../repositories/audit';
import { recordSystemError } from '../../repositories/errors';
import { fetchWithTimeout } from '../../http/fetch-timeout';

type TicketJob=Extract<OrbitJob,{type:'ticket-open-dispatch'}>;
type TicketActionJob=Extract<OrbitJob,{type:'ticket-action-dispatch'}>;

export async function handleTicketInteraction(env:Env,interaction:any):Promise<any|null>{
  const custom=String(interaction.data?.custom_id||''),guildId=String(interaction.guild_id||''),userId=String(interaction.member?.user?.id||'');
  if(!guildId||!userId)return null;
  if(interaction.type===3&&custom==='orbit_ticket_category')return beginTicket(env,interaction,Number(interaction.data.values?.[0]));
  if(interaction.type===3&&custom.startsWith('orbit_ticket_open:'))return beginTicket(env,interaction,Number(custom.split(':')[1]));
  if(interaction.type===5&&custom.startsWith('orbit_ticket_modal:')){
    const categoryId=Number(custom.split(':')[1]),answers=modalValues(interaction.data?.components);
    return queueTicket(env,interaction,categoryId,answers);
  }
  if(interaction.type===3&&custom.startsWith('orbit_ticket_close:'))return beginTicketAction(env,interaction,Number(custom.split(':')[1]),'close');
  if(interaction.type===3&&custom.startsWith('orbit_ticket_delete:'))return beginTicketAction(env,interaction,Number(custom.split(':')[1]),'delete');
  if(interaction.type===5&&custom.startsWith('orbit_ticket_close_modal:'))return queueTicketAction(env,interaction,Number(custom.split(':')[1]),'close');
  if(interaction.type===5&&custom.startsWith('orbit_ticket_delete_modal:'))return queueTicketAction(env,interaction,Number(custom.split(':')[1]),'delete');
  return null;
}

async function beginTicketAction(env:Env,interaction:any,ticketId:number,action:'close'|'delete'):Promise<any>{
  const ticket=await loadTicket(env,String(interaction.guild_id),ticketId);
  if(!ticket)return ephemeral('That ticket no longer exists.');
  if(String(ticket.channel_id||'')!==String(interaction.channel_id||''))return ephemeral('This ticket control is not valid in this channel.');
  if(action==='close'&&(ticket.status==='closed'||ticket.status==='deleted'))return ephemeral(ticket.status==='deleted'?'This ticket was deleted.':'This ticket is already closed.');
  if(action==='delete'&&ticket.status==='deleted')return ephemeral('This ticket was already deleted.');
  const manager=canManageTicket(ticket,interaction.member);
  if(action==='close'&&String(ticket.opener_user_id)!==String(interaction.member?.user?.id)&&!manager)return ephemeral('Only the ticket opener or ticket staff can close this ticket.');
  if(action==='delete'&&!manager)return ephemeral('Only configured ticket staff or members with Manage Channels can delete a ticket.');
  const label=action==='close'?'Reason for closing':'Reason for deletion';
  return {type:9,data:{custom_id:`orbit_ticket_${action}_modal:${ticketId}`,title:action==='close'?'Close Ticket':'Delete Ticket',components:[{type:18,label,description:'Required for the ticket record and audit history.',component:{type:4,custom_id:'reason',style:2,required:true,min_length:1,max_length:1000,placeholder:'Explain why this ticket is being resolved.'}}]}};
}

async function queueTicketAction(env:Env,interaction:any,ticketId:number,action:'close'|'delete'):Promise<any>{
  if(!env.JOBS)return ephemeral('Ticket processing is unavailable because the Orbit job queue is not configured.');
  const reason=String(modalValues(interaction.data?.components).reason||'').trim();
  if(!reason)return ephemeral('A reason is required.');
  const actorId=String(interaction.member?.user?.id||'');
  const job:TicketActionJob={type:'ticket-action-dispatch',guildId:String(interaction.guild_id),ticketId,action,reason:reason.slice(0,1000),actorId,actorRoleIds:Array.isArray(interaction.member?.roles)?interaction.member.roles.map(String):[],actorPermissions:String(interaction.member?.permissions||'0'),channelId:String(interaction.channel_id||''),interactionId:String(interaction.id),interactionToken:String(interaction.token)};
  try{await env.JOBS.send(job);return {type:5,data:{flags:64}};}catch{return ephemeral(`Orbit could not queue the ticket ${action}. Please try again in a moment.`);}
}

async function beginTicket(env:Env,interaction:any,categoryId:number):Promise<any>{
  const category=await env.DB.prepare('SELECT * FROM ticket_categories WHERE id=? AND guild_id=? AND enabled=1').bind(categoryId,interaction.guild_id).first<any>();
  if(!category)return ephemeral('That ticket category is unavailable.');
  const fields=parse(category.form_json);
  if(fields.length)return {type:9,data:{custom_id:`orbit_ticket_modal:${categoryId}`,title:String(category.name).slice(0,45),components:fields.slice(0,5).map((field:any,index:number)=>({type:18,label:String(field.label||`Question ${index+1}`).slice(0,45),component:{type:4,custom_id:`field_${index}`,style:field.long?2:1,required:field.required!==false,max_length:Math.min(Number(field.max_length||1000),4000)}}))}};
  return queueTicket(env,interaction,categoryId,{});
}

async function queueTicket(env:Env,interaction:any,categoryId:number,answers:Record<string,string>):Promise<any>{
  if(!env.JOBS)return ephemeral('Ticket processing is unavailable because the Orbit job queue is not configured.');
  const job:TicketJob={type:'ticket-open-dispatch',guildId:String(interaction.guild_id),userId:String(interaction.member.user.id),categoryId,answers,interactionId:String(interaction.id),interactionToken:String(interaction.token),username:String(interaction.member.user.username||interaction.member.user.id)};
  try{await env.JOBS.send(job);return {type:5,data:{flags:64}};}catch{return ephemeral('Orbit could not queue this ticket. Please try again in a moment.');}
}

export async function dispatchTicketOpen(env:Env,job:TicketJob):Promise<void>{
  const category=await env.DB.prepare('SELECT * FROM ticket_categories WHERE id=? AND guild_id=? AND enabled=1').bind(job.categoryId,job.guildId).first<any>();
  if(!category){await editReply(env,job.interactionToken,'That ticket category is no longer available.');return;}
  const prior=await env.DB.prepare('SELECT id,status,channel_id FROM tickets WHERE interaction_id=?').bind(job.interactionId).first<any>();
  if(prior?.channel_id){await editReply(env,job.interactionToken,`Ticket created: <#${prior.channel_id}>`);return;}
  const existing=await env.DB.prepare("SELECT id,channel_id FROM tickets WHERE guild_id=? AND opener_user_id=? AND category_id=? AND status IN ('creating','open','claimed')").bind(job.guildId,job.userId,job.categoryId).first<any>();
  if(existing){await editReply(env,job.interactionToken,existing.channel_id?`You already have an open ticket: <#${existing.channel_id}>`:'Your ticket is already being created.');return;}
  const now=Date.now();
  let ticketId:number;
  if(prior){ticketId=Number(prior.id);await env.DB.prepare("UPDATE tickets SET status='creating',form_response_json=?,closed_at=NULL WHERE id=?").bind(JSON.stringify(job.answers),ticketId).run();}
  else{const inserted=await env.DB.prepare("INSERT INTO tickets(guild_id,category_id,channel_id,opener_user_id,status,form_response_json,opened_at,interaction_id) VALUES(?,?,?,?,?,?,?,?)").bind(job.guildId,job.categoryId,null,job.userId,'creating',JSON.stringify(job.answers),now,job.interactionId).run();ticketId=Number(inserted.meta.last_row_id);}
  const staff:string[]=parse(category.staff_role_ids_json).map(String).filter(id=>/^\d+$/.test(id)).slice(0,50);
  const overwrites=[{id:job.guildId,type:0,deny:'1024',allow:'0'},{id:env.DISCORD_CLIENT_ID,type:1,deny:'0',allow:'68608'},{id:job.userId,type:1,deny:'0',allow:'68608'},...staff.map(id=>({id,type:0,deny:'0',allow:'68608'}))];
  const username=job.username.toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'member';
  const channelResponse=await discord(env,`/guilds/${job.guildId}/channels`,{method:'POST',body:JSON.stringify({name:`ticket-${username}`,type:0,parent_id:category.discord_category_id||undefined,permission_overwrites:overwrites})});
  if(!channelResponse.ok){let detail:any={};try{detail=await channelResponse.json<any>()}catch{}const requestId=await recordSystemError(env,job.guildId,'/guilds/:guild/channels','POST',channelResponse.status,'ticket_channel_create_failed',detail);await env.DB.prepare("UPDATE tickets SET status='failed',closed_at=? WHERE id=?").bind(Date.now(),ticketId).run();await editReply(env,job.interactionToken,`Orbit could not create the private ticket channel. ${detail?.message||`Discord HTTP ${channelResponse.status}`}. Reference ${requestId}.`);return;}
  const channel=await channelResponse.json<any>();
  await env.DB.prepare("UPDATE tickets SET channel_id=?,status='open' WHERE id=?").bind(channel.id,ticketId).run();
  const form=parse(category.form_json),fields=Object.entries(job.answers).slice(0,5).map(([key,value])=>{const index=Number(key.replace('field_',''));return {name:String(form[index]?.label||`Question ${index+1}`).slice(0,256),value:String(value||'No response').slice(0,1024),inline:false};});
  const openingMessage:any={content:`<@${job.userId}> your **${String(category.name).slice(0,100)}** ticket is open.\n\nSupport staff can respond here.`,components:[{type:1,components:[{type:2,style:2,label:'Close Ticket',custom_id:`orbit_ticket_close:${ticketId}`},{type:2,style:4,label:'Delete Ticket (Staff)',custom_id:`orbit_ticket_delete:${ticketId}`}]}],allowed_mentions:{parse:[],users:[job.userId]}};
  if(fields.length)openingMessage.embeds=[{title:'Ticket details',fields,color:0x8b5cf6}];
  const messageResponse=await discord(env,`/channels/${channel.id}/messages`,{method:'POST',body:JSON.stringify(openingMessage)});
  if(!messageResponse.ok){let detail:any={};try{detail=await messageResponse.json<any>()}catch{}const requestId=await recordSystemError(env,job.guildId,'/channels/:channel/messages','POST',messageResponse.status,'ticket_opening_message_failed',detail);await audit(env,job.guildId,job.userId,'ticket_opened_message_failed',{ticket_id:ticketId,category_id:job.categoryId,channel_id:channel.id,request_id:requestId});await editReply(env,job.interactionToken,`Ticket created: <#${channel.id}>, but Orbit could not post the opening message. Reference ${requestId}.`);return;}
  await audit(env,job.guildId,job.userId,'ticket_opened',{ticket_id:ticketId,category_id:job.categoryId,channel_id:channel.id});
  await editReply(env,job.interactionToken,`Ticket created: <#${channel.id}>`);
}

export async function dispatchTicketAction(env:Env,job:TicketActionJob):Promise<void>{
  const ticket=await loadTicket(env,job.guildId,job.ticketId);
  if(!ticket){await editReply(env,job.interactionToken,'That ticket no longer exists.');return;}
  if(String(ticket.channel_id||'')!==job.channelId){await editReply(env,job.interactionToken,'This ticket control is not valid in this channel.');return;}
  const manager=canManageTicket(ticket,{user:{id:job.actorId},roles:job.actorRoleIds,permissions:job.actorPermissions});
  if(job.action==='close'&&job.actorId!==String(ticket.opener_user_id)&&!manager){await editReply(env,job.interactionToken,'You no longer have permission to close this ticket.');return;}
  if(job.action==='delete'&&!manager){await editReply(env,job.interactionToken,'You no longer have permission to delete this ticket.');return;}
  if(job.action==='close'){
    if(ticket.status==='closed'){await editReply(env,job.interactionToken,'This ticket is already closed.');return;}
    if(ticket.status==='deleted'){await editReply(env,job.interactionToken,'This ticket was deleted.');return;}
    const channelResponse=await discord(env,`/channels/${ticket.channel_id}`);
    if(!channelResponse.ok){const detail=await responseDetail(channelResponse);const requestId=await recordSystemError(env,job.guildId,'/channels/:channel','GET',channelResponse.status,'ticket_close_channel_read_failed',detail);await editReply(env,job.interactionToken,`Orbit could not close this ticket. ${detail?.message||`Discord HTTP ${channelResponse.status}`}. Reference ${requestId}.`);return;}
    const channel=await channelResponse.json<any>(),overwrites=Array.isArray(channel.permission_overwrites)?channel.permission_overwrites.map((item:any)=>({id:String(item.id),type:Number(item.type),allow:String(item.allow||'0'),deny:String(item.deny||'0')})):[];
    const memberIndex=overwrites.findIndex((item:any)=>item.id===String(ticket.opener_user_id)&&item.type===1),memberOverwrite=memberIndex>=0?overwrites[memberIndex]:{id:String(ticket.opener_user_id),type:1,allow:'0',deny:'0'};
    memberOverwrite.allow=changePermission(memberOverwrite.allow,1024n|65536n,2048n);memberOverwrite.deny=changePermission(memberOverwrite.deny,2048n,0n);
    if(memberIndex>=0)overwrites[memberIndex]=memberOverwrite;else overwrites.push(memberOverwrite);
    const locked=await discord(env,`/channels/${ticket.channel_id}`,{method:'PATCH',body:JSON.stringify({permission_overwrites:overwrites})});
    if(!locked.ok){const detail=await responseDetail(locked);const requestId=await recordSystemError(env,job.guildId,'/channels/:channel','PATCH',locked.status,'ticket_close_permissions_failed',detail);await editReply(env,job.interactionToken,`Orbit could not lock this ticket. ${detail?.message||`Discord HTTP ${locked.status}`}. Reference ${requestId}.`);return;}
    const now=Date.now();await env.DB.prepare("UPDATE tickets SET status='closed',closed_at=?,closed_reason=?,closed_by_user_id=? WHERE id=? AND guild_id=?").bind(now,job.reason,job.actorId,job.ticketId,job.guildId).run();
    const notice=await discord(env,`/channels/${ticket.channel_id}/messages`,{method:'POST',body:JSON.stringify({content:`🔒 Ticket closed by <@${job.actorId}>.\n**Reason:** ${job.reason}`,allowed_mentions:{parse:[]}})});
    let suffix='';if(!notice.ok){const detail=await responseDetail(notice);const requestId=await recordSystemError(env,job.guildId,'/channels/:channel/messages','POST',notice.status,'ticket_close_notice_failed',detail);suffix=` The channel was locked, but the closing notice failed. Reference ${requestId}.`;}
    await audit(env,job.guildId,String(ticket.opener_user_id),'ticket_closed',{ticket_id:job.ticketId,reason:job.reason,interaction_id:job.interactionId},job.actorId);
    await editReply(env,job.interactionToken,`Ticket closed. The channel and history were kept.${suffix}`);return;
  }
  if(ticket.status==='deleted'){await editReply(env,job.interactionToken,'This ticket was already deleted.');return;}
  const removed=await discord(env,`/channels/${ticket.channel_id}`,{method:'DELETE'});
  if(!removed.ok&&removed.status!==404){const detail=await responseDetail(removed);const requestId=await recordSystemError(env,job.guildId,'/channels/:channel','DELETE',removed.status,'ticket_channel_delete_failed',detail);await editReply(env,job.interactionToken,`Orbit could not delete this ticket. ${detail?.message||`Discord HTTP ${removed.status}`}. Reference ${requestId}.`);return;}
  await env.DB.prepare("UPDATE tickets SET status='deleted',deleted_at=?,deleted_reason=?,deleted_by_user_id=? WHERE id=? AND guild_id=?").bind(Date.now(),job.reason,job.actorId,job.ticketId,job.guildId).run();
  await audit(env,job.guildId,String(ticket.opener_user_id),'ticket_deleted',{ticket_id:job.ticketId,channel_id:ticket.channel_id,reason:job.reason,interaction_id:job.interactionId},job.actorId);
  await editReply(env,job.interactionToken,'Ticket deleted. The reason was retained in Orbit records.');
}

async function loadTicket(env:Env,guildId:string,ticketId:number):Promise<any>{return env.DB.prepare('SELECT tickets.*,ticket_categories.staff_role_ids_json FROM tickets LEFT JOIN ticket_categories ON ticket_categories.id=tickets.category_id AND ticket_categories.guild_id=tickets.guild_id WHERE tickets.id=? AND tickets.guild_id=?').bind(ticketId,guildId).first<any>()}
function canManageTicket(ticket:any,member:any):boolean{const roles=new Set(Array.isArray(member?.roles)?member.roles.map(String):[]),staff=parse(ticket.staff_role_ids_json).map(String);if(staff.some(id=>roles.has(id)))return true;try{const permissions=BigInt(String(member?.permissions||'0'));return Boolean(permissions&8n)||Boolean(permissions&16n)}catch{return false}}
function changePermission(value:string,add:bigint,remove:bigint):string{try{return ((BigInt(value||'0')|add)&~remove).toString()}catch{return add.toString()}}
async function responseDetail(response:Response):Promise<any>{try{return await response.clone().json<any>()}catch{return {}}}
function modalValues(components:any):Record<string,string>{const values:Record<string,string>={};const visit=(component:any)=>{if(!component||typeof component!=='object')return;if(component.custom_id&&component.value!==undefined)values[String(component.custom_id)]=String(component.value||'');if(component.component)visit(component.component);if(Array.isArray(component.components))component.components.forEach(visit)};(Array.isArray(components)?components:[]).forEach(visit);return values}

async function editReply(env:Env,token:string,content:string):Promise<void>{await fetchWithTimeout(`https://discord.com/api/v10/webhooks/${env.DISCORD_CLIENT_ID}/${encodeURIComponent(token)}/messages/@original`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({content:String(content).slice(0,2000),allowed_mentions:{parse:[]}})});}
function parse(raw:any):any[]{try{return Array.isArray(raw)?raw:JSON.parse(raw||'[]')}catch{return []}}
function ephemeral(content:string){return {type:4,data:{content:String(content).slice(0,2000),flags:64}}}
