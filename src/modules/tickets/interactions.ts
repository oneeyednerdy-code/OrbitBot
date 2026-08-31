import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { audit } from '../../repositories/audit';

export async function handleTicketInteraction(env: Env, interaction:any): Promise<any|null>{
  const custom=String(interaction.data?.custom_id||'');const guildId=interaction.guild_id;const userId=interaction.member?.user?.id;if(!guildId||!userId)return null;
  if(interaction.type===3 && custom==='orbit_ticket_category'){
    const id=Number(interaction.data.values?.[0]);const cat=await env.DB.prepare('SELECT * FROM ticket_categories WHERE id=? AND guild_id=? AND enabled=1').bind(id,guildId).first<any>();if(!cat)return ephemeral('That category is unavailable.');const fields=parse(cat.form_json);
    if(fields.length)return {type:9,data:{custom_id:`orbit_ticket_modal:${id}`,title:String(cat.name).slice(0,45),components:fields.slice(0,5).map((f:any,i:number)=>({type:1,components:[{type:4,custom_id:`field_${i}`,label:String(f.label||`Question ${i+1}`).slice(0,45),style:f.long?2:1,required:f.required!==false,max_length:Math.min(Number(f.max_length||1000),4000)}]}))}};
    return createTicket(env,guildId,userId,id,{},interaction);
  }
  if(interaction.type===5 && custom.startsWith('orbit_ticket_modal:')){
    const id=Number(custom.split(':')[1]);const answers:any={};for(const row of interaction.data.components||[])for(const c of row.components||[])answers[c.custom_id]=c.value;return createTicket(env,guildId,userId,id,answers,interaction);
  }
  if(interaction.type===3 && custom.startsWith('orbit_ticket_close:')){
    const id=Number(custom.split(':')[1]);const ticket=await env.DB.prepare("SELECT * FROM tickets WHERE id=? AND guild_id=? AND status!='closed'").bind(id,guildId).first<any>();if(!ticket)return ephemeral('Ticket already closed.');await env.DB.prepare("UPDATE tickets SET status='closed',closed_at=? WHERE id=?").bind(Date.now(),id).run();if(ticket.channel_id)await discord(env,`/channels/${ticket.channel_id}`,{method:'PATCH',body:JSON.stringify({permission_overwrites:[{id:guildId,type:0,deny:'1024',allow:'0'},{id:ticket.opener_user_id,type:1,deny:'2048',allow:'1024'}]})});await audit(env,guildId,userId,'ticket_closed',{ticket_id:id});return ephemeral('Ticket closed.');
  }
  return null;
}
async function createTicket(env:Env,guildId:string,userId:string,categoryId:number,answers:any,interaction:any){
  const cat=await env.DB.prepare('SELECT * FROM ticket_categories WHERE id=? AND guild_id=? AND enabled=1').bind(categoryId,guildId).first<any>();if(!cat)return ephemeral('That category is unavailable.');
  const existing=await env.DB.prepare("SELECT id FROM tickets WHERE guild_id=? AND opener_user_id=? AND category_id=? AND status!='closed'").bind(guildId,userId,categoryId).first();if(existing)return ephemeral('You already have an open ticket in this category.');
  const staff:string[]=parse(cat.staff_role_ids_json);const overwrites=[{id:guildId,type:0,deny:'1024',allow:'0'},{id:userId,type:1,deny:'0',allow:'68608'},...staff.map(id=>({id,type:0,deny:'0',allow:'68608'}))];
  const channelRes=await discord(env,`/guilds/${guildId}/channels`,{method:'POST',body:JSON.stringify({name:`ticket-${String(interaction.member.user.username||userId).toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,40)}`,type:0,parent_id:cat.discord_category_id||undefined,permission_overwrites:overwrites})});if(!channelRes.ok)return ephemeral('Orbit could not create the ticket channel. Check Manage Channels permission.');const channel=await channelRes.json<any>();const now=Date.now();const r=await env.DB.prepare('INSERT INTO tickets(guild_id,category_id,channel_id,opener_user_id,status,form_response_json,opened_at) VALUES(?,?,?,?,?,?,?)').bind(guildId,categoryId,channel.id,userId,'open',JSON.stringify(answers),now).run();const ticketId=Number(r.meta.last_row_id);const answerText=Object.entries(answers).map(([k,v])=>`**${k}:** ${String(v)}`).join('\n');await discord(env,`/channels/${channel.id}/messages`,{method:'POST',body:JSON.stringify({content:`<@${userId}> your **${cat.name}** ticket is open.\n${answerText}\n\nSupport staff can respond here.`,components:[{type:1,components:[{type:2,style:4,label:'Close Ticket',custom_id:`orbit_ticket_close:${ticketId}`}]}]})});await audit(env,guildId,userId,'ticket_opened',{ticket_id:ticketId,category_id:categoryId,channel_id:channel.id});return ephemeral(`Ticket created: <#${channel.id}>`);
}
function parse(raw:any){try{return Array.isArray(raw)?raw:JSON.parse(raw||'[]')}catch{return []}}
function ephemeral(content:string){return {type:4,data:{content,flags:64}}}
