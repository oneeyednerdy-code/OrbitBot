import type { Env } from '../../types';
import { openSeal } from '../../security/crypto';

export type PublishResult={ok:boolean;externalId?:string;error?:string};
export async function publishExternal(env:Env,integration:any,content:string):Promise<PublishResult>{
 if(!integration.credential_ciphertext||!env.SOCIAL_CREDENTIAL_KEY)return {ok:false,error:'credentials_missing'};
 let cred:any;try{cred=JSON.parse(await openSeal(integration.credential_ciphertext,env.SOCIAL_CREDENTIAL_KEY));}catch{return {ok:false,error:'credentials_unreadable'};}
 if(integration.platform==='bluesky')return bluesky(cred,content);
 if(integration.platform==='mastodon')return mastodon(cred,content);
 if(integration.platform==='threads')return threads(cred,content);
 return {ok:false,error:'publishing_not_supported_for_platform'};
}
async function bluesky(c:any,text:string):Promise<PublishResult>{
 if(!c.identifier||!c.app_password)return {ok:false,error:'bluesky_credentials_incomplete'};
 const auth=await fetch('https://bsky.social/xrpc/com.atproto.server.createSession',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:c.identifier,password:c.app_password})});if(!auth.ok)return {ok:false,error:`bluesky_auth_${auth.status}`};const a=await auth.json<any>();const now=new Date().toISOString();const post=await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord',{method:'POST',headers:{authorization:`Bearer ${a.accessJwt}`,'content-type':'application/json'},body:JSON.stringify({repo:a.did,collection:'app.bsky.feed.post',record:{$type:'app.bsky.feed.post',text:text.slice(0,3000),createdAt:now}})});if(!post.ok)return {ok:false,error:`bluesky_post_${post.status}`};const d=await post.json<any>();return {ok:true,externalId:d.uri};
}
async function mastodon(c:any,text:string):Promise<PublishResult>{
 if(!c.instance||!c.access_token)return {ok:false,error:'mastodon_credentials_incomplete'};const base=String(c.instance).replace(/\/$/,'');const r=await fetch(`${base}/api/v1/statuses`,{method:'POST',headers:{authorization:`Bearer ${c.access_token}`,'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({status:text.slice(0,5000)})});if(!r.ok)return {ok:false,error:`mastodon_post_${r.status}`};const d=await r.json<any>();return {ok:true,externalId:d.id};
}
async function threads(c:any,text:string):Promise<PublishResult>{
 if(!c.user_id||!c.access_token)return {ok:false,error:'threads_credentials_incomplete'};const make=new URL(`https://graph.threads.net/v1.0/${encodeURIComponent(c.user_id)}/threads`);make.searchParams.set('media_type','TEXT');make.searchParams.set('text',text.slice(0,500));make.searchParams.set('access_token',c.access_token);const r=await fetch(make,{method:'POST'});if(!r.ok)return {ok:false,error:`threads_create_${r.status}`};const d=await r.json<any>();const publish=new URL(`https://graph.threads.net/v1.0/${encodeURIComponent(c.user_id)}/threads_publish`);publish.searchParams.set('creation_id',d.id);publish.searchParams.set('access_token',c.access_token);const p=await fetch(publish,{method:'POST'});if(!p.ok)return {ok:false,error:`threads_publish_${p.status}`};const out=await p.json<any>();return {ok:true,externalId:out.id};
}
