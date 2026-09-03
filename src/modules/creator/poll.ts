import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { publicHttpsUrl } from '../../security/outbound-url';
type External={live:boolean,id:string,title:string,url:string,vodUrl?:string};
let twitchTokenCache:{value:string;expiresAt:number}|null=null;
export async function pollCreatorSources(env:Env):Promise<void>{
 const sources=(await env.DB.prepare('SELECT * FROM creator_sources WHERE enabled=1 ORDER BY COALESCE(last_checked_at,0) ASC LIMIT 50').all<any>()).results;
 for(const s of sources){try{const item=s.source_type==='twitch'?await twitchState(env,s.source_value):s.source_type==='youtube'?await youtubeState(env,s.source_value):await rssState(s.source_value);const now=Date.now();await env.DB.prepare('UPDATE creator_sources SET last_checked_at=?,last_error=NULL WHERE id=?').bind(now,s.id).run();if(!item)continue;
   const wasLive=!!s.last_live_state, isLive=item.live, cooldown=Number(s.cooldown_minutes||10)*60000, canNotify=!s.last_notified_at||now-Number(s.last_notified_at)>=cooldown;
   if(s.source_type==='rss'){if(!s.last_external_id){await env.DB.prepare('UPDATE creator_sources SET last_external_id=? WHERE id=?').bind(item.id,s.id).run();continue;}if(item.id!==s.last_external_id&&canNotify){await sendAlert(env,s,render(s.live_message||'{creator} posted something new!\n{title}\n{url}',s,item));await env.DB.prepare('UPDATE creator_sources SET last_external_id=?,last_notified_at=? WHERE id=?').bind(item.id,now,s.id).run();}continue;}
   if(isLive&&!wasLive&&s.notify_live&&canNotify){await sendAlert(env,s,render(s.live_message||'🔴 **{creator} is LIVE!**\n{title}\n{url}',s,item));await env.DB.prepare('UPDATE creator_sources SET last_live_state=1,last_external_id=?,last_notified_at=? WHERE id=?').bind(item.id,now,s.id).run();continue;}
   if(!isLive&&wasLive){if(s.notify_offline&&canNotify)await sendAlert(env,s,render(s.offline_message||'💜 **{creator} has finished streaming.**\nCatch up here: {vod_url}',s,item));await env.DB.prepare('UPDATE creator_sources SET last_live_state=0,last_notified_at=? WHERE id=?').bind(s.notify_offline?now:s.last_notified_at,s.id).run();continue;}
   await env.DB.prepare('UPDATE creator_sources SET last_live_state=?,last_external_id=? WHERE id=?').bind(isLive?1:0,item.id||s.last_external_id,s.id).run();
  }catch(e){await env.DB.prepare('UPDATE creator_sources SET last_checked_at=?,last_error=? WHERE id=?').bind(Date.now(),String(e).slice(0,300),s.id).run();}}
 await pollRoleGatedCreators(env);
}
async function sendAlert(env:Env,s:any,content:string){const mention=s.mention_role_id?`<@&${s.mention_role_id}> `:'',message=`${mention}${content}`;if(message.length>2000)throw new Error('message_too_long');const response=await discord(env,`/channels/${s.discord_channel_id}/messages`,{method:'POST',body:JSON.stringify({content:message,allowed_mentions:{parse:[],roles:s.mention_role_id?[s.mention_role_id]:[]}})});if(!response.ok)throw new Error(await discordError('discord_post_failed',response));}
function render(t:string,s:any,i:External){return t.replaceAll('{creator}',s.label).replaceAll('{title}',i.title||'').replaceAll('{url}',i.url||'').replaceAll('{vod_url}',s.vod_url||i.vodUrl||i.url||'');}
async function twitchState(env:Env,login:string):Promise<External>{if(!env.TWITCH_CLIENT_ID||!env.TWITCH_CLIENT_SECRET)throw new Error('twitch_secrets_missing');const accessToken=await twitchToken(env);const r=await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`,{headers:{'client-id':env.TWITCH_CLIENT_ID,authorization:`Bearer ${accessToken}`}});if(!r.ok)throw new Error(`twitch_${r.status}`);const x=(await r.json<any>()).data?.[0];return x?{live:true,id:x.id,title:x.title||`${login} is live`,url:`https://twitch.tv/${login}`,vodUrl:`https://twitch.tv/${login}/videos`}:{live:false,id:`offline:${login}`,title:'Offline',url:`https://twitch.tv/${login}`,vodUrl:`https://twitch.tv/${login}/videos`};}
async function twitchToken(env:Env):Promise<string>{if(twitchTokenCache&&twitchTokenCache.expiresAt>Date.now()+60000)return twitchTokenCache.value;const tokenRes=await fetch(`https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(env.TWITCH_CLIENT_ID!)}&client_secret=${encodeURIComponent(env.TWITCH_CLIENT_SECRET!)}&grant_type=client_credentials`,{method:'POST'});if(!tokenRes.ok)throw new Error(`twitch_token_${tokenRes.status}`);const token=await tokenRes.json<any>();if(!token.access_token)throw new Error('twitch_token_missing');twitchTokenCache={value:String(token.access_token),expiresAt:Date.now()+Math.max(60,Number(token.expires_in||3600))*1000};return twitchTokenCache.value;}
async function youtubeState(env:Env,channelId:string):Promise<External>{const channelUrl=`https://youtube.com/channel/${channelId}`,vodUrl=`${channelUrl}/streams`,latest=await feedLatest(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);if(!env.YOUTUBE_API_KEY)return latest?{live:false,id:latest.id,title:latest.title,url:latest.url,vodUrl}:{live:false,id:`offline:${channelId}`,title:'Offline',url:channelUrl,vodUrl};if(!latest)return {live:false,id:`offline:${channelId}`,title:'Offline',url:channelUrl,vodUrl};const videoId=youtubeVideoId(latest);if(!videoId)throw new Error('youtube_video_id_missing');const u=new URL('https://www.googleapis.com/youtube/v3/videos');u.searchParams.set('part','snippet,liveStreamingDetails');u.searchParams.set('id',videoId);u.searchParams.set('key',env.YOUTUBE_API_KEY);const response=await fetch(u);if(!response.ok)throw new Error(`youtube_${response.status}`);const video=(await response.json<any>()).items?.[0],details=video?.liveStreamingDetails||{},live=video?.snippet?.liveBroadcastContent==='live'||Boolean(details.actualStartTime&&!details.actualEndTime);return live?{live:true,id:videoId,title:video?.snippet?.title||latest.title||'Live on YouTube',url:`https://youtube.com/watch?v=${videoId}`,vodUrl}:{live:false,id:`offline:${channelId}`,title:'Offline',url:channelUrl,vodUrl};}
async function rssState(url:string):Promise<External|null>{const x=await feedLatest(url);return x?{live:false,...x}:null;}
async function feedLatest(value:string){const url=publicHttpsUrl(value);if(!url)throw new Error('feed_url_not_public_https');const r=await fetch(url,{headers:{'user-agent':'OrbitBot/0.1 creator notifier'},redirect:'error'});if(!r.ok)throw new Error(`feed_${r.status}`);const xml=(await r.text()).slice(0,2_000_000);const block=match(xml,/<item\b[\s\S]*?<\/item>/i)||match(xml,/<entry\b[\s\S]*?<\/entry>/i);if(!block)return null;const title=decode(tag(block,'title')||'New post');const id=decode(tag(block,'guid')||tag(block,'id')||attr(block,'link','href')||tag(block,'link')||title);const urlOut=decode(attr(block,'link','href')||tag(block,'link')||'');return {id,title,url:urlOut};}
function match(s:string,r:RegExp){return s.match(r)?.[0]||''}function tag(s:string,n:string){return s.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`,'i'))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,'').trim()||''}function attr(s:string,n:string,a:string){return s.match(new RegExp(`<${n}[^>]*\\s${a}=["']([^"']+)["'][^>]*>`,'i'))?.[1]||''}function decode(s:string){return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")}
function youtubeVideoId(item:{id:string;url:string}):string{try{const id=new URL(item.url).searchParams.get('v');if(id)return id;}catch{}return item.id.replace(/^yt:video:/,'');}

async function pollRoleGatedCreators(env:Env):Promise<void>{
 const configs=(await env.DB.prepare('SELECT * FROM creator_role_alert_configs WHERE enabled=1 AND required_role_id IS NOT NULL AND discord_channel_id IS NOT NULL LIMIT 20').all<any>()).results;
 for(const config of configs){
  const interval=Math.max(5,Number(config.poll_interval_minutes||5))*60000,cutoff=Date.now()-interval;
  const creators=(await env.DB.prepare(`SELECT d.* FROM creator_directory d WHERE d.guild_id=? AND d.approved=1 AND d.enabled=1 AND d.discord_user_id IS NOT NULL AND (d.twitch_name IS NOT NULL OR d.youtube_channel_id IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM creator_role_alert_states s WHERE s.guild_id=d.guild_id AND s.directory_creator_id=d.id AND s.last_checked_at>?) ORDER BY d.display_name LIMIT 50`).bind(config.guild_id,cutoff).all<any>()).results;
  for(const creator of creators)await pollRoleGatedCreator(env,config,creator);
 }
}

async function pollRoleGatedCreator(env:Env,config:any,creator:any):Promise<void>{
 const memberResponse=await discord(env,`/guilds/${config.guild_id}/members/${creator.discord_user_id}`);
 if(!memberResponse.ok){
  const reason=memberResponse.status===404?'member_not_found':await discordError('member_check_failed',memberResponse);
  await markCreatorIneligible(env,config.guild_id,creator,reason);return;
 }
 const member=await memberResponse.json<any>(),eligible=Array.isArray(member.roles)&&member.roles.includes(config.required_role_id);
 if(!eligible){await markCreatorIneligible(env,config.guild_id,creator,null);return;}
 const sources:[string,string][]=[];
 if(creator.twitch_name)sources.push(['twitch',creator.twitch_name]);
 if(creator.youtube_channel_id)sources.push(['youtube',creator.youtube_channel_id]);
 for(const [platform,value] of sources){
  try{
   const item=platform==='twitch'?await twitchState(env,value):await youtubeState(env,value),now=Date.now();
   const previous=await env.DB.prepare('SELECT * FROM creator_role_alert_states WHERE guild_id=? AND directory_creator_id=? AND platform=?').bind(config.guild_id,creator.id,platform).first<any>();
   if(item.live&&!previous?.last_live_state){
    const source={label:creator.display_name,mention_role_id:config.mention_role_id,discord_channel_id:config.discord_channel_id};
    const content=renderRoleMessage(config.live_message||'🔴 **{creator} is LIVE on {platform}!**\n{title}\n{url}',creator,item,platform);
    await sendAlert(env,source,content);
   }
   await upsertRoleState(env,config.guild_id,creator.id,platform,item.live?1:0,item.id,1,now,item.live&&!previous?.last_live_state?now:previous?.last_notified_at||null,null);
  }catch(error){await upsertRoleState(env,config.guild_id,creator.id,platform,0,null,1,Date.now(),null,String(error).slice(0,300));}
 }
}

async function markCreatorIneligible(env:Env,guildId:string,creator:any,error:string|null):Promise<void>{
 const now=Date.now(),platforms:string[]=[];if(creator.twitch_name)platforms.push('twitch');if(creator.youtube_channel_id)platforms.push('youtube');
 for(const platform of platforms)await upsertRoleState(env,guildId,creator.id,platform,0,null,0,now,null,error);
}

async function upsertRoleState(env:Env,guildId:string,creatorId:number,platform:string,live:number,externalId:string|null,eligible:number,checkedAt:number,notifiedAt:number|null,error:string|null):Promise<void>{
 await env.DB.prepare(`INSERT INTO creator_role_alert_states(guild_id,directory_creator_id,platform,last_live_state,last_external_id,eligible,last_checked_at,last_notified_at,last_error) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(guild_id,directory_creator_id,platform) DO UPDATE SET last_live_state=excluded.last_live_state,last_external_id=COALESCE(excluded.last_external_id,creator_role_alert_states.last_external_id),eligible=excluded.eligible,last_checked_at=excluded.last_checked_at,last_notified_at=COALESCE(excluded.last_notified_at,creator_role_alert_states.last_notified_at),last_error=excluded.last_error`).bind(guildId,creatorId,platform,live,externalId,eligible,checkedAt,notifiedAt,error).run();
}

function renderRoleMessage(template:string,creator:any,item:External,platform:string):string{return template.replaceAll('{creator}',creator.display_name).replaceAll('{platform}',platform==='twitch'?'Twitch':'YouTube').replaceAll('{title}',item.title||'').replaceAll('{url}',item.url||'');}
async function discordError(prefix:string,response:Response):Promise<string>{let code='';try{const body=await response.clone().json<any>();code=body?.code?`_${body.code}`:'';}catch{}return `${prefix}_${response.status}${code}`;}
