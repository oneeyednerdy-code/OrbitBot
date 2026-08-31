import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { json } from '../../http/responses';

export async function rolesApi(request: Request, env: Env, guildId: string, actorId: string): Promise<Response> {
  if (request.method === 'GET') {
    const panels = await env.DB.prepare('SELECT * FROM role_panels WHERE guild_id=? ORDER BY created_at DESC').bind(guildId).all<any>();
    for (const panel of panels.results) panel.items=(await env.DB.prepare('SELECT * FROM role_panel_items WHERE panel_id=? ORDER BY sort_order,id').bind(panel.id).all<any>()).results;
    return json({panels:panels.results});
  }
  if (request.method === 'POST') {
    const body=await request.json<any>(); const now=Date.now();
    if(!body.channel_id||!body.name||!Array.isArray(body.items)||body.items.length<1) return json({error:'invalid_panel'},400);
    const type=body.interaction_type==='select'?'select':'button';
    const ins=await env.DB.prepare('INSERT INTO role_panels(guild_id,channel_id,name,interaction_type,config_json,enabled,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(guildId,body.channel_id,body.name,type,'{}',1,actorId,now,now).run();
    const panelId=Number(ins.meta.last_row_id);
    for(let i=0;i<body.items.length;i++){const item=body.items[i];if(!/^\d+$/.test(String(item.role_id)))continue;await env.DB.prepare('INSERT INTO role_panel_items(panel_id,role_id,label,emoji,sort_order) VALUES(?,?,?,?,?)').bind(panelId,String(item.role_id),String(item.label||'Role'),item.emoji||null,i).run();}
    const items=(await env.DB.prepare('SELECT * FROM role_panel_items WHERE panel_id=? ORDER BY sort_order,id').bind(panelId).all<any>()).results;
    const components=type==='select'?[{type:1,components:[{type:3,custom_id:`orbit_roles:${panelId}`,min_values:0,max_values:Math.min(items.length,25),placeholder:'Choose your roles',options:items.slice(0,25).map((x:any)=>({label:x.label,value:x.role_id,...(x.emoji?{emoji:{name:x.emoji}}:{})}))}]}]:chunk(items,5).slice(0,5).map(row=>({type:1,components:row.map((x:any)=>({type:2,style:2,label:x.label,custom_id:`orbit_role:${panelId}:${x.role_id}`,...(x.emoji?{emoji:{name:x.emoji}}:{})}))}));
    const sent=await discord(env,`/channels/${body.channel_id}/messages`,{method:'POST',body:JSON.stringify({content:String(body.message||`**${body.name}**\nChoose the roles you want.`),components})});
    if(sent.ok){const msg=await sent.json<any>();await env.DB.prepare('UPDATE role_panels SET message_id=? WHERE id=?').bind(msg.id,panelId).run();}
    return json({ok:sent.ok,panel_id:panelId},sent.ok?200:400);
  }
  if(request.method==='DELETE'){
    const id=Number(new URL(request.url).searchParams.get('id'));if(!id)return json({error:'invalid_id'},400);
    await env.DB.prepare('DELETE FROM role_panel_items WHERE panel_id IN (SELECT id FROM role_panels WHERE id=? AND guild_id=?)').bind(id,guildId).run();
    await env.DB.prepare('DELETE FROM role_panels WHERE id=? AND guild_id=?').bind(id,guildId).run(); return json({ok:true});
  }
  return json({error:'method_not_allowed'},405);
}
function chunk<T>(items:T[],size:number){const out:T[][]=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out;}
