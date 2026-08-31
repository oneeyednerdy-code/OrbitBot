import type { Env } from '../../types';
import { json } from '../../http/responses';
import { randomToken, sha256 } from '../../security/crypto';

export async function kofiApi(request:Request,env:Env,guildId:string):Promise<Response>{
  if(request.method==='GET'){
    const [integration,milestones,totals]=await Promise.all([
      env.DB.prepare('SELECT enabled,default_channel_id,settings_json,updated_at FROM kofi_integrations WHERE guild_id=?').bind(guildId).first(),
      env.DB.prepare('SELECT * FROM kofi_milestones WHERE guild_id=? ORDER BY amount_minor').bind(guildId).all(),
      env.DB.prepare('SELECT * FROM kofi_totals WHERE guild_id=?').bind(guildId).all()
    ]);
    return json({integration:integration??{},milestones:milestones.results,totals:totals.results});
  }

  if(request.method==='POST'){
    const body=await request.json<any>();
    const now=Date.now();

    if(body.op==='connect'){
      const token=randomToken();
      await env.DB.prepare(`INSERT INTO kofi_integrations(guild_id,enabled,webhook_token_hash,default_channel_id,settings_json,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET enabled=1,webhook_token_hash=excluded.webhook_token_hash,default_channel_id=excluded.default_channel_id,updated_at=excluded.updated_at`)
        .bind(guildId,1,await sha256(token),body.default_channel_id||null,'{}',now).run();
      return json({ok:true,webhook_url:`${env.APP_ORIGIN}/webhooks/kofi/${guildId}/${token}`});
    }

    if(body.op==='milestone'){
      const amount=Math.round(Number(body.amount||0)*100);
      if(!body.name||amount<=0)return json({error:'invalid_milestone'},400);
      await env.DB.prepare('INSERT INTO kofi_milestones(guild_id,name,amount_minor,currency,actions_json,enabled) VALUES(?,?,?,?,?,1)')
        .bind(guildId,String(body.name).trim().slice(0,120),amount,String(body.currency||'USD').toUpperCase().slice(0,8),JSON.stringify([{type:'discord_message',content:String(body.message||`Milestone reached: ${body.name}!`).slice(0,2000)}])).run();
      return json({ok:true});
    }

    if(body.op==='update_milestone'){
      const id=Number(body.id);
      const amount=Math.round(Number(body.amount||0)*100);
      if(!Number.isInteger(id)||id<=0||!body.name||amount<=0)return json({error:'invalid_milestone'},400);
      const existing=await env.DB.prepare('SELECT id FROM kofi_milestones WHERE id=? AND guild_id=?').bind(id,guildId).first();
      if(!existing)return json({error:'milestone_not_found'},404);
      await env.DB.prepare('UPDATE kofi_milestones SET name=?,amount_minor=?,currency=?,actions_json=? WHERE id=? AND guild_id=?')
        .bind(String(body.name).trim().slice(0,120),amount,String(body.currency||'USD').toUpperCase().slice(0,8),JSON.stringify([{type:'discord_message',content:String(body.message||`Milestone reached: ${body.name}!`).slice(0,2000)}]),id,guildId).run();
      return json({ok:true});
    }
  }

  return json({error:'method_not_allowed'},405);
}
