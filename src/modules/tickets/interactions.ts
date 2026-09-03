import type { Env, OrbitJob } from '../../types';
import { discord } from '../../discord/client';
import { audit } from '../../repositories/audit';
import { recordSystemError } from '../../repositories/errors';

type TicketJob=Extract<OrbitJob,{type:'ticket-open-dispatch'}>;

export async function handleTicketInteraction(env:Env,interaction:any):Promise<any|null>{
  const custom=String(interaction.data?.custom_id||''),guildId=String(interaction.guild_id||''),userId=String(interaction.member?.user?.id||'');
  if(!guildId||!userId)return null;
  if(interaction.type===3&&custom==='orbit_ticket_category')return beginTicket(env,interaction,Number(interaction.data.values?.[0]));
  if(interaction.type===3&&custom.startsWith('orbit_ticket_open:'))return beginTicket(env,interaction,Number(custom.split(':')[1]));
  if(interaction.type===5&&custom.startsWith('orbit_ticket_modal:')){
    const categoryId=Number(custom.split(':')[1]),answers:Record<string,string>={};
    for(const row of interaction.data.components||[])for(const component of row.components||[])answers[String(component.custom_id)]=String(component.value||'');
    return queueTicket(env,interaction,categoryId,answers);
  }
  if(interaction.type===3&&custom.startsWith('orbit_ticket_close:')){
    const id=Number(custom.split(':')[1]),ticket=await env.DB.prepare("SELECT * FROM tickets WHERE id=? AND guild_id=? AND status!='closed'").bind(id,guildId).first<any>();
    if(!ticket)return ephemeral('Ticket already closed.');
    await env.DB.prepare("UPDATE tickets SET status='closed',closed_at=? WHERE id=?").bind(Date.now(),id).run();
    if(ticket.channel_id)await discord(env,`/channels/${ticket.channel_id}`,{method:'PATCH',body:JSON.stringify({permission_overwrites:[{id:guildId,type:0,deny:'1024',allow:'0'},{id:env.DISCORD_CLIENT_ID,type:1,deny:'0',allow:'68608'},{id:ticket.opener_user_id,type:1,deny:'2048',allow:'66560'}]})});
    await audit(env,guildId,userId,'ticket_closed',{ticket_id:id});return ephemeral('Ticket closed.');
  }
  return null;
}

async function beginTicket(env:Env,interaction:any,categoryId:number):Promise<any>{
  const category=await env.DB.prepare('SELECT * FROM ticket_categories WHERE id=? AND guild_id=? AND enabled=1').bind(categoryId,interaction.guild_id).first<any>();
  if(!category)return ephemeral('That ticket category is unavailable.');
  const fields=parse(category.form_json);
  if(fields.length)return {type:9,data:{custom_id:`orbit_ticket_modal:${categoryId}`,title:String(category.name).slice(0,45),components:fields.slice(0,5).map((field:any,index:number)=>({type:1,components:[{type:4,custom_id:`field_${index}`,label:String(field.label||`Question ${index+1}`).slice(0,45),style:field.long?2:1,required:field.required!==false,max_length:Math.min(Number(field.max_length||1000),4000)}]}))}};
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
  const openingMessage:any={content:`<@${job.userId}> your **${String(category.name).slice(0,100)}** ticket is open.\n\nSupport staff can respond here.`,components:[{type:1,components:[{type:2,style:4,label:'Close Ticket',custom_id:`orbit_ticket_close:${ticketId}`}]}],allowed_mentions:{parse:[],users:[job.userId]}};
  if(fields.length)openingMessage.embeds=[{title:'Ticket details',fields,color:0x8b5cf6}];
  const messageResponse=await discord(env,`/channels/${channel.id}/messages`,{method:'POST',body:JSON.stringify(openingMessage)});
  if(!messageResponse.ok){let detail:any={};try{detail=await messageResponse.json<any>()}catch{}const requestId=await recordSystemError(env,job.guildId,'/channels/:channel/messages','POST',messageResponse.status,'ticket_opening_message_failed',detail);await audit(env,job.guildId,job.userId,'ticket_opened_message_failed',{ticket_id:ticketId,category_id:job.categoryId,channel_id:channel.id,request_id:requestId});await editReply(env,job.interactionToken,`Ticket created: <#${channel.id}>, but Orbit could not post the opening message. Reference ${requestId}.`);return;}
  await audit(env,job.guildId,job.userId,'ticket_opened',{ticket_id:ticketId,category_id:job.categoryId,channel_id:channel.id});
  await editReply(env,job.interactionToken,`Ticket created: <#${channel.id}>`);
}

async function editReply(env:Env,token:string,content:string):Promise<void>{await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_CLIENT_ID}/${encodeURIComponent(token)}/messages/@original`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({content:String(content).slice(0,2000),allowed_mentions:{parse:[]}})});}
function parse(raw:any):any[]{try{return Array.isArray(raw)?raw:JSON.parse(raw||'[]')}catch{return []}}
function ephemeral(content:string){return {type:4,data:{content:String(content).slice(0,2000),flags:64}}}
