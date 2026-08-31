import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { json } from '../../http/responses';

export async function ticketsApi(request: Request, env: Env, guildId: string): Promise<Response> {
  if(request.method==='GET'){
    const [cats,tickets]=await Promise.all([env.DB.prepare('SELECT * FROM ticket_categories WHERE guild_id=? ORDER BY sort_order,id').bind(guildId).all(),env.DB.prepare('SELECT * FROM tickets WHERE guild_id=? ORDER BY opened_at DESC LIMIT 100').bind(guildId).all()]);
    return json({categories:cats.results,tickets:tickets.results});
  }
  if(request.method==='POST'){
    const body=await request.json<any>();const op=body.op||'category';
    if(op==='category'){
      if(!body.name)return json({error:'name_required'},400);const now=Date.now();const forms=Array.isArray(body.form)?body.form.slice(0,5):[];
      const r=await env.DB.prepare('INSERT INTO ticket_categories(guild_id,name,description,emoji,discord_category_id,staff_role_ids_json,form_json,enabled,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(guildId,String(body.name),body.description||null,body.emoji||null,body.discord_category_id||null,JSON.stringify(body.staff_role_ids||[]),JSON.stringify(forms),1,Number(body.sort_order||0),now,now).run();return json({ok:true,id:Number(r.meta.last_row_id)});
    }
    if(op==='panel'){
      const channelId=String(body.channel_id||'');if(!channelId)return json({error:'channel_required'},400);const cats=(await env.DB.prepare('SELECT * FROM ticket_categories WHERE guild_id=? AND enabled=1 ORDER BY sort_order,id LIMIT 25').bind(guildId).all<any>()).results;if(!cats.length)return json({error:'no_categories'},400);
      const sent=await discord(env,`/channels/${channelId}/messages`,{method:'POST',body:JSON.stringify({content:String(body.message||'**Support Tickets**\nChoose a category to open a private ticket.'),components:[{type:1,components:[{type:3,custom_id:'orbit_ticket_category',placeholder:'Choose a ticket category',options:cats.map(c=>({label:c.name,value:String(c.id),description:(c.description||'Open a support ticket').slice(0,100),...(c.emoji?{emoji:{name:c.emoji}}:{})}))}]}]})});
      if(sent.ok){const msg=await sent.json<any>();for(const c of cats)await env.DB.prepare('UPDATE ticket_categories SET panel_channel_id=?,panel_message_id=? WHERE id=?').bind(channelId,msg.id,c.id).run();}return json({ok:sent.ok},sent.ok?200:400);
    }
  }
  return json({error:'method_not_allowed'},405);
}
