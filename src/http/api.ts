import type { Env } from '../types';
import { managedGuild } from '../auth/authorization';
import { getSession } from '../auth/session';
import { installUrl } from '../auth/oauth';
import { moduleCatalog } from '../modules/diagnostics/catalog';
import { handleGuildApi, listManageableGuilds } from '../modules/dashboard/api';
import { json } from './responses';
import { operatorBugApi } from '../modules/bug-reports/api';
import { recordSystemError } from '../repositories/errors';
import { loadGuildResources, validateChannelIds, validateRoleIds } from '../discord/guild-resources';

function validMutation(request: Request, env: Env, csrf: string): boolean {
  return request.headers.get('origin') === env.APP_ORIGIN && request.headers.get('x-orby-csrf') === csrf;
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const session = await getSession(request, env);
  if (!session) return json({ error: 'unauthorized' }, 401);
  const contentLength=Number(request.headers.get('content-length')||0);
  const maxBodyBytes=url.pathname.endsWith('/reliability')?1_000_000:256_000;
  if(request.method!=='GET'&&Number.isFinite(contentLength)&&contentLength>maxBodyBytes)return json({error:'request_too_large',detail:`Orbit API requests are limited to ${Math.round(maxBodyBytes/1024)} KB for this endpoint.`},413);
  if (request.method !== 'GET' && !validMutation(request, env, session.csrf_token)) return json({ error: 'forbidden' }, 403);

  if (url.pathname === '/api/me') { const operator=String(env.ORBIT_OPERATOR_USER_IDS||'').split(',').map(v=>v.trim()).filter(Boolean).includes(session.user_id); return json({ id: session.user_id, username: session.username, avatar: session.avatar, csrf: session.csrf_token, operator }); }
  if (url.pathname === '/api/modules') return json(moduleCatalog);
  if (url.pathname === '/api/install-url') return json({ url: installUrl(env, url.searchParams.get('guild_id')) });
  if (url.pathname === '/api/guilds') return listManageableGuilds(env, session);
  if (url.pathname === '/api/operator/bugs') return operatorBugApi(request, env, session.user_id);

  const match = url.pathname.match(/^\/api\/guilds\/(\d+)(?:\/(bootstrap|config|post-rules|create-verification|post-verification|overview|diagnostics|logs|moderation|roles|tickets|scheduler|leveling|automation|community|community-engagement|kofi|creator|social|security|shield|creator-directory|events|applications|health|creator-safety|operations|reliability|onboarding|connections|bug-reports|channel-manager|start-gateway))?$/);
  if (!match) return json({ error: 'not_found' }, 404);
  const guildId = match[1];
  const action = match[2] ?? 'config';
  const authorization = await managedGuild(request, env, guildId, session);
  if (!authorization.ok) return json({ error: authorization.error, detail: authorization.detail, retry_after: authorization.retry_after }, authorization.status);
  try {
    const resourceFailure=await validateMutationResources(request,env,guildId,action);
    if(resourceFailure)return resourceFailure;
    return await handleGuildApi(request, env, guildId, action, authorization.guild, authorization.session);
  } catch (error: any) {
    const requestId = await recordSystemError(env, guildId, url.pathname, request.method, 500, 'unhandled_api_error', { name: error?.name, message: error?.message, stack: String(error?.stack || '').split('\n').slice(0, 8) });
    return json({ error: 'internal_error', detail: 'Orbit hit an unexpected server error.', request_id: requestId }, 500);
  }
}

async function validateMutationResources(request:Request,env:Env,guildId:string,action:string):Promise<Response|null>{
  if(request.method==='GET'||request.method==='DELETE'||['channel-manager','roles','tickets','post-verification','reliability'].includes(action))return null;
  let body:any={};
  try{body=await request.clone().json<any>();}catch{return request.headers.get('content-type')?.includes('application/json')?json({error:'invalid_json',detail:'The request body is not valid JSON.'},400):null;}
  const channels:unknown[]=[];
  const roles:unknown[]=[];
  const add=(target:unknown[],...values:unknown[])=>target.push(...values.flatMap(value=>Array.isArray(value)?value:[value]).filter(Boolean));
  if(action==='config'){add(channels,body.admin_log_channel_id);add(roles,body.rules_role_id,body.verified_role_id,body.combined_role_id);}
  if(action==='post-rules')add(channels,body.channel_id);
  if(action==='moderation'){add(channels,body.channel_id,body.log_channel_id);add(roles,body.exempt_roles);}
  if(action==='logs'&&body.operation==='save_feed')add(channels,body.admin_log_channel_id);
  if(action==='scheduler'&&(body.op==='create'||body.op==='batch'||!body.op)){const posts=body.op==='batch'&&Array.isArray(body.posts)?body.posts:[body];for(const post of posts){add(channels,post.channel_id);add(roles,post.ping_role_id);}}
  if(action==='automation'&&!body.op){for(const item of [...(Array.isArray(body.conditions)?body.conditions:[]),...(Array.isArray(body.actions)?body.actions:[])]){add(channels,item?.channel_id);add(roles,item?.role_id);}}
  if(action==='community'){add(channels,body.welcome_channel_id,body.goodbye_channel_id,body.channel_id);add(roles,body.autorole_id);}
  if(action==='community-engagement'&&body.op==='save')add(channels,body.channel_id);
  if(action==='leveling'){add(channels,body.announce_channel_id);add(roles,body.reward_role_id);}
  if(action==='social'&&(body.op==='connect_discord'||body.op==='connect'))add(channels,body.discord_channel_id);
  if(action==='security'&&body.op==='save'){add(channels,body.channel_ids,body.alert_channel_id);}
  if(action==='shield'&&body.op==='save'){add(channels,body.channel_ids,body.alert_channel_id);add(roles,body.alert_role_id);}
  if(action==='creator-safety'&&body.op==='save'){add(channels,body.channel_ids,body.alert_channel_id);}
  if(action==='creator'){add(channels,body.discord_channel_id);add(roles,body.required_role_id,body.mention_role_id);}
  if(action==='events'){add(channels,body.discord_channel_id);add(roles,body.ping_role_id);}
  if(!channels.length&&!roles.length)return null;
  const resources=await loadGuildResources(env,guildId,{channels:channels.length>0,roles:roles.length>0});
  if(!resources.ok)return json(resources,resources.status);
  const channelFailure=validateChannelIds(resources,[...new Set(channels.map(String))]);
  if(channelFailure)return json(channelFailure,channelFailure.status);
  const roleFailure=validateRoleIds(resources,[...new Set(roles.map(String))]);
  if(roleFailure)return json(roleFailure,roleFailure.status);
  return null;
}
