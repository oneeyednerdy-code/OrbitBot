import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { json } from '../../http/responses';
import { recordSystemError } from '../../repositories/errors';

export async function ticketsApi(request:Request,env:Env,guildId:string):Promise<Response>{
  if(request.method==='GET'){
    const [categories,tickets]=await Promise.all([env.DB.prepare('SELECT * FROM ticket_categories WHERE guild_id=? ORDER BY sort_order,id').bind(guildId).all(),env.DB.prepare('SELECT * FROM tickets WHERE guild_id=? ORDER BY opened_at DESC LIMIT 100').bind(guildId).all()]);
    return json({categories:categories.results,tickets:tickets.results});
  }
  if(request.method==='POST'){
    const body=await request.json<any>(),operation=body.op||'category';
    if(operation==='category')return createCategory(env,guildId,body);
    if(operation==='panel')return postPanel(env,guildId,body);
  }
  return json({error:'method_not_allowed'},405);
}

async function createCategory(env:Env,guildId:string,body:any):Promise<Response>{
  const name=String(body.name||'').trim();if(!name)return json({error:'name_required',detail:'Enter a ticket category name.'},400);
  const now=Date.now(),forms=(Array.isArray(body.form)?body.form:[]).slice(0,5).map((field:any,index:number)=>({label:String(field?.label||`Question ${index+1}`).trim().slice(0,45),long:field?.long!==false,required:field?.required!==false})).filter((field:any)=>field.label),staffRoleIds=(Array.isArray(body.staff_role_ids)?body.staff_role_ids:[]).map(String).filter((id:string)=>/^\d{16,20}$/.test(id)).slice(0,50);
  const categoryId=Number(body.id||0);
  if(categoryId){
    const existing=await env.DB.prepare('SELECT id FROM ticket_categories WHERE id=? AND guild_id=?').bind(categoryId,guildId).first<any>();
    if(!existing)return json({error:'category_not_found',detail:'That ticket category no longer exists.'},404);
    await env.DB.prepare('UPDATE ticket_categories SET name=?,description=?,emoji=?,discord_category_id=?,staff_role_ids_json=?,form_json=?,enabled=?,sort_order=?,updated_at=? WHERE id=? AND guild_id=?').bind(name.slice(0,100),String(body.description||'').slice(0,1000)||null,String(body.emoji||'').slice(0,32)||null,String(body.discord_category_id||'').trim()||null,JSON.stringify(staffRoleIds),JSON.stringify(forms),body.enabled===false?0:1,Number(body.sort_order||0),now,categoryId,guildId).run();
    return json({ok:true,id:categoryId,updated:true,repost_panel:true});
  }
  const result=await env.DB.prepare('INSERT INTO ticket_categories(guild_id,name,description,emoji,discord_category_id,staff_role_ids_json,form_json,enabled,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(guildId,name.slice(0,100),String(body.description||'').slice(0,1000)||null,String(body.emoji||'').slice(0,32)||null,String(body.discord_category_id||'').trim()||null,JSON.stringify(staffRoleIds),JSON.stringify(forms),body.enabled===false?0:1,Number(body.sort_order||0),now,now).run();
  return json({ok:true,id:Number(result.meta.last_row_id)});
}

async function postPanel(env:Env,guildId:string,body:any):Promise<Response>{
  const channelId=String(body.channel_id||''),mode=body.panel_type==='dropdown'?'dropdown':'direct',message=String(body.message||'**Support Tickets**\nNeed help? Open a private ticket below.');
  if(!channelId)return json({error:'channel_required',detail:'Choose the Discord channel where Orbit should post the ticket panel.'},400);
  if(message.length>2000)return json({error:'message_too_long',detail:'The ticket panel message must be 2,000 characters or fewer.'},400);
  const [categoryResult,channelResponse]=await Promise.all([env.DB.prepare('SELECT * FROM ticket_categories WHERE guild_id=? AND enabled=1 ORDER BY sort_order,id LIMIT 25').bind(guildId).all<any>(),discord(env,`/guilds/${guildId}/channels`)]);
  if(!channelResponse.ok)return json({error:'discord_channels_unavailable',detail:`Discord returned HTTP ${channelResponse.status} while Orbit checked the panel channel.`},502);
  const channels=await channelResponse.json<any[]>();
  if(!channels.some(channel=>String(channel.id)===channelId&&(channel.type===0||channel.type===5)))return json({error:'invalid_panel_channel',detail:'Choose a text or announcement channel from this server.'},400);
  const categories=categoryResult.results;if(!categories.length)return json({error:'no_categories',detail:'Create at least one enabled ticket category before posting a panel.'},400);
  let usedCategories=categories,components:any[];
  if(mode==='direct'){
    const categoryId=Number(body.category_id||categories[0].id),category=categories.find(item=>Number(item.id)===categoryId);
    if(!category)return json({error:'invalid_ticket_category',detail:'Choose the category used by the direct ticket button.'},400);
    usedCategories=[category];components=[{type:1,components:[{type:2,style:1,label:String(body.button_label||'Open Ticket').slice(0,80),custom_id:`orbit_ticket_open:${category.id}`}]}];
  }else{
    components=[{type:1,components:[{type:3,custom_id:'orbit_ticket_category',placeholder:'Choose a ticket category',min_values:1,max_values:1,options:categories.map(category=>({label:String(category.name).slice(0,100),value:String(category.id),description:String(category.description||'Open a support ticket').slice(0,100),...(category.emoji?{emoji:{name:category.emoji}}:{})}))}]}];
  }
  const sent=await discord(env,`/channels/${channelId}/messages`,{method:'POST',body:JSON.stringify({content:message,components,allowed_mentions:{parse:[]}})});
  if(!sent.ok){let detail:any={};try{detail=await sent.json<any>()}catch{}const requestId=await recordSystemError(env,guildId,'/channels/:channel/messages','POST',sent.status,'ticket_panel_post_failed',detail);return json({error:'ticket_panel_post_failed',detail:detail?.message||`Discord returned HTTP ${sent.status} while posting the ticket panel.`,discord_code:detail?.code||null,request_id:requestId},400);}
  const discordMessage=await sent.json<any>();
  for(const category of usedCategories)await env.DB.prepare('UPDATE ticket_categories SET panel_channel_id=?,panel_message_id=? WHERE id=? AND guild_id=?').bind(channelId,discordMessage.id,category.id,guildId).run();
  return json({ok:true,panel_type:mode,message_id:discordMessage.id,channel_id:channelId});
}
