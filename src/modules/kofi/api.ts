import type { Env } from '../../types';
import { json } from '../../http/responses';
import { sha256 } from '../../security/crypto';

function webhookUrl(env:Env,guildId:string):string {
  return `${String(env.APP_ORIGIN).replace(/\/$/,'')}/webhooks/kofi/${encodeURIComponent(guildId)}`;
}

export async function kofiApi(request:Request,env:Env,guildId:string,guild?:any):Promise<Response>{
  if(request.method==='GET'){
    const [integrationRow,milestones,totals]=await Promise.all([
      env.DB.prepare('SELECT enabled,webhook_token_hash,default_channel_id,settings_json,updated_at FROM kofi_integrations WHERE guild_id=?').bind(guildId).first(),
      env.DB.prepare('SELECT * FROM kofi_milestones WHERE guild_id=? ORDER BY amount_minor').bind(guildId).all(),
      env.DB.prepare('SELECT * FROM kofi_totals WHERE guild_id=?').bind(guildId).all()
    ]);
    const integration=integrationRow?{
      ...integrationRow,
      token_configured:Boolean((integrationRow as any).webhook_token_hash),
      webhook_url:webhookUrl(env,guildId)
    }:{enabled:0,token_configured:false,webhook_url:webhookUrl(env,guildId)};
    if(integrationRow)delete (integration as any).webhook_token_hash;
    return json({integration,milestones:milestones.results,totals:totals.results});
  }

  if(request.method==='POST'){
    const body=await request.json<any>();
    const now=Date.now();

    if(body.op==='connect'){
      if(guild?.owner!==true)return json({error:'owner_only',detail:'Only the Discord server owner can save the Ko-fi verification token.'},403);
      const token=typeof body.webhook_token==='string'?body.webhook_token.trim():'';
      const existing=await env.DB.prepare('SELECT webhook_token_hash,settings_json FROM kofi_integrations WHERE guild_id=?').bind(guildId).first<any>();
      if(!token&&!existing?.webhook_token_hash)return json({error:'webhook_token_required',detail:'Paste the Ko-fi verification token before saving the webhook.'},400);
      const tokenHash=token?await sha256(token):existing.webhook_token_hash;
      await env.DB.prepare(`INSERT INTO kofi_integrations(guild_id,enabled,webhook_token_hash,default_channel_id,settings_json,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET enabled=1,webhook_token_hash=excluded.webhook_token_hash,default_channel_id=excluded.default_channel_id,updated_at=excluded.updated_at`)
        .bind(guildId,1,tokenHash,body.default_channel_id||null,existing?.settings_json||'{}',now).run();
      return json({ok:true,webhook_url:webhookUrl(env,guildId),token_configured:true});
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

    if(body.op==='delete_milestone'){
      const id=Number(body.id);
      if(!Number.isInteger(id)||id<=0)return json({error:'invalid_milestone'},400);
      const result=await env.DB.prepare('DELETE FROM kofi_milestones WHERE id=? AND guild_id=?').bind(id,guildId).run();
      if(!result.meta.changes)return json({error:'milestone_not_found'},404);
      return json({ok:true});
    }

    if(body.op==='toggle_milestone'){
      const id=Number(body.id);
      if(!Number.isInteger(id)||id<=0)return json({error:'invalid_milestone'},400);
      const existing=await env.DB.prepare('SELECT enabled FROM kofi_milestones WHERE id=? AND guild_id=?').bind(id,guildId).first<any>();
      if(!existing)return json({error:'milestone_not_found'},404);
      await env.DB.prepare('UPDATE kofi_milestones SET enabled=? WHERE id=? AND guild_id=?').bind(Number(existing.enabled)===1?0:1,id,guildId).run();
      return json({ok:true,enabled:Number(existing.enabled)===1?0:1});
    }
  }

  return json({error:'method_not_allowed'},405);
}
