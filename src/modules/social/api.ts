import type { Env } from '../../types';
import { json } from '../../http/responses';
import { seal } from '../../security/crypto';
import { loadGuildResources, validateChannelIds } from '../../discord/guild-resources';
import { textLimitsForIntegrations, validateTextTargets } from './limits';
export async function socialApi(request:Request,env:Env,guildId:string,actorId:string):Promise<Response>{
 if(request.method==='GET'){
  const [posts,rows]=await Promise.all([env.DB.prepare('SELECT * FROM social_publish_posts WHERE guild_id=? ORDER BY created_at DESC LIMIT 100').bind(guildId).all(),env.DB.prepare('SELECT * FROM social_integrations WHERE guild_id=? ORDER BY platform,account_label').bind(guildId).all()]);
  const limits=await textLimitsForIntegrations(env,rows.results as any[]);
  const integrations=(rows.results as any[]).map(({credential_ciphertext,...safe})=>safe);
  return json({posts:posts.results,integrations,limits,platforms:['discord','threads','bluesky','mastodon']});
 }
 if(request.method==='POST'){
  const b=await request.json<any>();
  if(b.op==='connect_discord'){
   if(!b.discord_channel_id)return json({error:'channel_required'},400);const resources=await loadGuildResources(env,guildId,{channels:true});if(!resources.ok)return json(resources,resources.status);const invalid=validateChannelIds(resources,[b.discord_channel_id]);if(invalid)return json(invalid,invalid.status);const now=Date.now();await env.DB.prepare(`INSERT INTO social_integrations(guild_id,platform,account_label,credential_ref,discord_channel_id,settings_json,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?) ON CONFLICT(guild_id,platform,account_label) DO UPDATE SET discord_channel_id=excluded.discord_channel_id,enabled=1,updated_at=excluded.updated_at`).bind(guildId,'discord','Default',null,String(b.discord_channel_id),'{}',now,now).run();return json({ok:true});
  }
  if(b.op==='connect'){
   if(!env.SOCIAL_CREDENTIAL_KEY)return json({error:'social_credential_key_missing'},500);if(!['threads','bluesky','mastodon'].includes(b.platform)||!b.account_label||!b.credentials)return json({error:'invalid_integration'},400);const cipher=await seal(JSON.stringify(b.credentials),env.SOCIAL_CREDENTIAL_KEY);const now=Date.now();await env.DB.prepare(`INSERT INTO social_integrations(guild_id,platform,account_label,credential_ref,discord_channel_id,settings_json,enabled,created_at,updated_at,credential_ciphertext,status) VALUES(?,?,?,?,?,?,1,?,?,?,'configured') ON CONFLICT(guild_id,platform,account_label) DO UPDATE SET credential_ciphertext=excluded.credential_ciphertext,enabled=1,updated_at=excluded.updated_at,status='configured'`).bind(guildId,b.platform,String(b.account_label),null,b.discord_channel_id||null,'{}',now,now,cipher).run();return json({ok:true});
  }
  const targets: string[]=Array.isArray(b.targets)?Array.from(new Set<string>(b.targets.filter((x:any)=>['discord','threads','bluesky','mastodon'].includes(x)).map(String))).slice(0,4):[];
  const content=String(b.content||'');if(!content.trim()||!targets.length)return json({error:'invalid_post',detail:'Choose at least one target and enter a message.'},400);
  const rows=await env.DB.prepare('SELECT * FROM social_integrations WHERE guild_id=?').bind(guildId).all();
  const limits=await textLimitsForIntegrations(env,rows.results as any[],targets);const violation=validateTextTargets(content,targets,limits);if(violation)return json({error:'text_limit_exceeded',detail:`${violation.platform} allows ${violation.limit} characters; this message has ${violation.count}.`,platform:violation.platform,limit:violation.limit,count:violation.count},400);
  const now=Date.now(),scheduled=Number(b.scheduled_for||now);if(!Number.isFinite(scheduled)||scheduled<now-60_000)return json({error:'invalid_schedule',detail:'Choose a valid current or future time.'},400);const status=scheduled<=now?'queued':'scheduled';const r=await env.DB.prepare('INSERT INTO social_publish_posts(guild_id,content,targets_json,status,scheduled_for,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(guildId,content,JSON.stringify(targets),status,scheduled,actorId,now,now).run();const id=Number(r.meta.last_row_id);if(status==='queued'&&env.JOBS)await env.JOBS.send({type:'social-dispatch',socialPostId:id});return json({ok:true,id,status});
 }
 return json({error:'method_not_allowed'},405);
}
