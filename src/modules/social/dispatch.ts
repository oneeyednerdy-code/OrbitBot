import type { Env } from '../../types';
import { publishExternal } from './adapters';
import { sendDiscordMessage } from '../../discord/messages';
import { isGuildMessageChannel } from '../../discord/guild-resources';

const SOCIAL_LEASE_MS=5*60_000;

export async function dispatchSocialPost(env:Env,id:number):Promise<void>{
  const now=Date.now();
  const claim=await env.DB.prepare("UPDATE social_publish_posts SET status='sending',dispatch_lease_until=?,dispatch_attempts=dispatch_attempts+1,updated_at=? WHERE id=? AND (status='queued' OR (status='sending' AND COALESCE(dispatch_lease_until,0)<=?))").bind(now+SOCIAL_LEASE_MS,now,id,now).run();
  if(!claim.meta.changes)return;
  const post=await env.DB.prepare('SELECT * FROM social_publish_posts WHERE id=?').bind(id).first<any>();
  if(!post)return;
  const security=await env.DB.prepare('SELECT lockdown_active FROM security_configs WHERE guild_id=?').bind(post.guild_id).first<any>();
  if(security?.lockdown_active){await env.DB.prepare("UPDATE social_publish_posts SET status='queued',dispatch_lease_until=NULL,updated_at=? WHERE id=?").bind(Date.now(),id).run();return;}
  const targets=parse(post.targets_json,[]);
  let all=true;
  for(const platform of targets){
    const previous=await env.DB.prepare("SELECT external_id FROM social_publish_runs WHERE post_id=? AND platform=? AND status='sent' ORDER BY attempted_at DESC LIMIT 1").bind(id,platform).first<any>();
    if(previous)continue;
    let status='unsupported',externalId=null,error:string|null='adapter_not_configured';
    if(platform==='discord'){
      const integration=await env.DB.prepare("SELECT discord_channel_id FROM social_integrations WHERE guild_id=? AND platform='discord' AND enabled=1 LIMIT 1").bind(post.guild_id).first<any>();
      if(integration?.discord_channel_id&&await isGuildMessageChannel(env,String(post.guild_id),String(integration.discord_channel_id))){
        const nonce=`orb-social-${id}`.slice(0,25);
        const response=await sendDiscordMessage(env,String(integration.discord_channel_id),{content:String(post.content).slice(0,2000),nonce,enforce_nonce:true});
        status=response.ok?'sent':'failed';error=response.ok?null:String(response.status);if(response.ok)externalId=(await response.json<any>()).id;
      }
    }else{
      const integration=await env.DB.prepare('SELECT * FROM social_integrations WHERE guild_id=? AND platform=? AND enabled=1 ORDER BY id LIMIT 1').bind(post.guild_id,platform).first<any>();
      if(integration){const response=await publishExternal(env,integration,String(post.content));status=response.ok?'sent':'failed';externalId=response.externalId||null;error=response.error||null;}
    }
    if(status!=='sent')all=false;
    await env.DB.prepare('INSERT INTO social_publish_runs(post_id,guild_id,platform,status,external_id,error_code,attempted_at) VALUES(?,?,?,?,?,?,?)').bind(id,post.guild_id,platform,status,externalId,error,Date.now()).run();
  }
  await env.DB.prepare('UPDATE social_publish_posts SET status=?,dispatch_lease_until=NULL,updated_at=? WHERE id=?').bind(all?'sent':'partial',Date.now(),id).run();
}

export async function socialSweep(env:Env):Promise<void>{
  if(!env.JOBS)return;
  const now=Date.now();
  const due=await env.DB.prepare("SELECT id,status FROM social_publish_posts WHERE (status='scheduled' AND scheduled_for<=?) OR status='queued' OR (status='sending' AND COALESCE(dispatch_lease_until,0)<=?) ORDER BY scheduled_for LIMIT 50").bind(now,now).all<any>();
  for(const row of due.results){
    if(row.status==='scheduled')await env.DB.prepare("UPDATE social_publish_posts SET status='queued',updated_at=? WHERE id=? AND status='scheduled'").bind(now,row.id).run();
    await env.JOBS.send({type:'social-dispatch',socialPostId:row.id});
  }
}

function parse(raw:any,fallback:any):any{try{return typeof raw==='string'?JSON.parse(raw):raw??fallback}catch{return fallback}}
