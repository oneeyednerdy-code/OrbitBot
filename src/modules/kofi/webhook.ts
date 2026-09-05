import type { Env } from '../../types';
import { sha256 } from '../../security/crypto';
import { discord } from '../../discord/client';
import { audit } from '../../repositories/audit';
import { sendDiscordMessage } from '../../discord/messages';
export async function kofiWebhook(request:Request,env:Env,guildId:string,legacyToken?:string):Promise<Response>{
 const cfg=await env.DB.prepare('SELECT * FROM kofi_integrations WHERE guild_id=? AND enabled=1').bind(guildId).first<any>();
 let raw:any={};const type=request.headers.get('content-type')||'';try{if(type.includes('application/x-www-form-urlencoded')){const form=await request.formData();raw=JSON.parse(String(form.get('data')||'{}'));}else raw=await request.json();}catch{return new Response('bad payload',{status:400});}
 const providedToken=legacyToken||String(raw.verification_token||'').trim();
 if(!cfg||!cfg.webhook_token_hash||!providedToken||await sha256(providedToken)!==cfg.webhook_token_hash)return new Response('not found',{status:404});
 const currency=String(raw.currency||'USD').toUpperCase();const amountMinor=Math.round(Number(raw.amount||0)*100);const tx=String(raw.kofi_transaction_id||raw.transaction_id||'').trim();if(amountMinor<=0)return new Response('ignored',{status:202});if(!tx)return new Response('transaction id required',{status:400});
 try{await env.DB.prepare('INSERT INTO kofi_events(guild_id,transaction_id,event_type,amount_minor,currency,received_at) VALUES(?,?,?,?,?,?)').bind(guildId,tx,String(raw.type||'donation'),amountMinor,currency,Date.now()).run();}catch{return new Response('duplicate',{status:200});}
 await env.DB.prepare(`INSERT INTO kofi_totals(guild_id,currency,amount_minor,updated_at) VALUES(?,?,?,?) ON CONFLICT(guild_id,currency) DO UPDATE SET amount_minor=kofi_totals.amount_minor+excluded.amount_minor,updated_at=excluded.updated_at`).bind(guildId,currency,amountMinor,Date.now()).run();const totalRow=await env.DB.prepare('SELECT amount_minor FROM kofi_totals WHERE guild_id=? AND currency=?').bind(guildId,currency).first<any>();const total=Number(totalRow?.amount_minor||0);
 const milestones=(await env.DB.prepare('SELECT * FROM kofi_milestones WHERE guild_id=? AND currency=? AND enabled=1 AND triggered_at IS NULL AND amount_minor<=? ORDER BY amount_minor').bind(guildId,currency,total).all<any>()).results;for(const m of milestones){const claimed=await env.DB.prepare('UPDATE kofi_milestones SET triggered_at=? WHERE id=? AND guild_id=? AND triggered_at IS NULL').bind(Date.now(),m.id,guildId).run();if(!claimed.meta.changes)continue;const actions=parse(m.actions_json,[]);for(const a of actions)if(a.type==='discord_message'&&cfg.default_channel_id)await sendDiscordMessage(env,String(cfg.default_channel_id),{content:String(a.content||`☕ ${m.name} reached!`).slice(0,2000)});await audit(env,guildId,null,'kofi_milestone_reached',{milestone_id:m.id,total_minor:total,currency});}
 return new Response('ok',{status:200});
}
function parse(raw:any,fallback:any){try{return typeof raw==='string'?JSON.parse(raw):raw??fallback}catch{return fallback}}
