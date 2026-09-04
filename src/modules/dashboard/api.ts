import type { Env, GuildConfigRow, SessionRow } from '../../types';
import { installUrl } from '../../auth/oauth';
import { discord } from '../../discord/client';
import { canManageGuild } from '../../discord/permissions';
import { json } from '../../http/responses';
import { openSeal } from '../../security/crypto';
import { audit } from '../../repositories/audit';
import { moduleCatalog } from '../diagnostics/catalog';
import { diagnosticsApi } from '../diagnostics/api';
import { logsApi } from '../logs/api';
import { moderationApi } from '../moderation/api';
import { rolesApi } from '../roles/api';
import { ticketsApi } from '../tickets/api';
import { schedulerApi } from '../scheduler/api';
import { levelingApi } from '../leveling/api';
import { automationApi } from '../automation/api';
import { communityApi } from '../community/api';
import { communityEngagementApi } from '../community-engagement/api';
import { kofiApi } from '../kofi/api';
import { creatorApi } from '../creator/api';
import { socialApi } from '../social/api';
import { securityApi } from '../security-center/api';
import { shieldApi } from '../shield/api';
import { creatorDirectoryApi } from '../creator-directory/api';
import { eventsApi } from '../events/api';
import { applicationsApi } from '../applications/api';
import { communityHealthApi } from '../community-health/api';
import { creatorSafetyApi } from '../creator-safety/api';
import { operationsApi } from '../operations/api';
import { reliabilityApi } from '../operations/reliability';
import { onboardingApi } from '../onboarding/api';
import { connectionsApi } from '../connections/api';
import { bugReportsApi } from '../bug-reports/api';
import { channelManagerApi } from '../channel-manager/api';
import { shortVideoApi } from '../short-video/api';
import { shortVideoUploadApi } from '../short-video/media';
import { createVerificationSession } from '../verification/session';
import { loadGuildResources, validateChannelIds } from '../../discord/guild-resources';
import { sendDiscordMessage } from '../../discord/messages';

export async function listManageableGuilds(request: Request, env: Env, session: SessionRow): Promise<Response> {
  let token: string;
  try { token = await openSeal(session.access_token, env.SESSION_SECRET); } catch { return json({ error: 'unauthorized' }, 401); }
  const response = await discord(env, '/users/@me/guilds', {}, token);
  if (response.status === 401 || response.status === 403) return json({ error: 'discord_reauth_required', detail: 'Discord no longer accepts this dashboard authorization. Reconnect Discord.' }, 401);
  if (response.status === 429) {
    let retryAfter = 1;
    try { const body = await response.clone().json<any>(); retryAfter = Math.max(1, Number(body?.retry_after || 1)); } catch {}
    return json({ error: 'discord_rate_limited', detail: 'Discord temporarily rate-limited the server list.', retry_after: retryAfter }, 429);
  }
  if (!response.ok) return json({ error: 'discord_authorization_failed', detail: `Discord server lookup returned HTTP ${response.status}.` }, 502);
  const guilds = ((await response.json()) as any[]).filter(guild => guild?.owner === true || canManageGuild(String(guild?.permissions ?? '0')));
  const result=guilds.map(guild => ({ id: guild.id, name: guild.name, icon: guild.icon, owner: guild.owner }));
  if(new URL(request.url).searchParams.get('include_channel_counts')!=='1')return json(result);
  const counted=[];
  for(const guild of result){
    try{
      const channelsResponse=await discord(env,`/guilds/${guild.id}/channels`,{},token);
      if(!channelsResponse.ok){counted.push({...guild,channel_count:null});continue;}
      const channels=await channelsResponse.json<any[]>();counted.push({...guild,channel_count:channels.length,category_count:channels.filter(channel=>Number(channel.type)===4).length});
    }catch{counted.push({...guild,channel_count:null});}
  }
  return json(counted);
}

export async function handleGuildApi(request: Request, env: Env, guildId: string, action: string, guild: any, session: SessionRow): Promise<Response> {
  if (action === 'bootstrap' && request.method === 'GET') return guildBootstrap(env, guildId, guild);
  if (action === 'overview' && request.method === 'GET') return guildOverview(env, guildId);
  if (action === 'config' && request.method === 'GET') return json((await env.DB.prepare('SELECT * FROM guild_config WHERE guild_id=?').bind(guildId).first()) ?? {});
  if (action === 'config' && request.method === 'POST') return saveAccessConfig(request, env, guildId, guild.name, session.user_id);
  if (action === 'post-rules' && request.method === 'POST') return postRules(request, env, guildId);
  if (action === 'create-verification' && request.method === 'POST') return createVerification(request, env, guildId);
  if (action === 'post-verification' && request.method === 'POST') return postVerification(request, env, guildId, session.user_id);
  if (action === 'diagnostics' && request.method === 'GET') return diagnosticsApi(env, guildId, session.user_id, false);
  if (action === 'diagnostics' && request.method === 'POST') return diagnosticsApi(env, guildId, session.user_id, true);
  if (action === 'logs') return logsApi(request, env, guildId, session.user_id);
  if (action === 'moderation') return moderationApi(request, env, guildId, session.user_id);
  if (action === 'roles') return rolesApi(request, env, guildId, session.user_id);
  if (action === 'tickets') return ticketsApi(request, env, guildId);
  if (action === 'scheduler') return schedulerApi(request, env, guildId, session.user_id);
  if (action === 'leveling') return levelingApi(request, env, guildId, session.user_id);
  if (action === 'automation') return automationApi(request, env, guildId, session.user_id);
  if (action === 'community') return communityApi(request, env, guildId, session.user_id);
  if (action === 'community-engagement') return communityEngagementApi(request, env, guildId, session.user_id);
  if (action === 'kofi') return kofiApi(request, env, guildId);
  if (action === 'creator') return creatorApi(request, env, guildId, session.user_id, guild);
  if (action === 'social') return socialApi(request, env, guildId, session.user_id);
  if (action === 'short-video') return shortVideoApi(request, env, guildId, session.user_id);
  if (action === 'short-video-upload') return shortVideoUploadApi(request, env, guildId, session.user_id);
  if (action === 'security') return securityApi(request, env, guildId, session.user_id);
  if (action === 'shield') return shieldApi(request, env, guildId, session.user_id);
  if (action === 'creator-directory') return creatorDirectoryApi(request, env, guildId);
  if (action === 'events') return eventsApi(request, env, guildId, session.user_id);
  if (action === 'applications') return applicationsApi(request, env, guildId);
  if (action === 'health') return communityHealthApi(request, env, guildId);
  if (action === 'creator-safety') return creatorSafetyApi(request, env, guildId, session.user_id);
  if (action === 'operations') return operationsApi(request, env, guildId);
  if (action === 'reliability') return reliabilityApi(request, env, guildId, session.user_id);
  if (action === 'onboarding') return onboardingApi(request, env, guildId, session.user_id);
  if (action === 'connections') return connectionsApi(request, env, guildId, session.user_id);
  if (action === 'bug-reports') return bugReportsApi(request, env, guildId, session.user_id);
  if (action === 'channel-manager') return channelManagerApi(request, env, guildId, session.user_id, guild);
  if (action === 'start-gateway' && request.method === 'POST') return startGateway(request, env, guildId, guild, session.user_id);
  return json({ error: 'bad_request' }, 400);
}

async function startGateway(request: Request, env: Env, guildId: string, guild: any, actorId: string): Promise<Response> {
  if (!env.GATEWAY) return json({ error: 'gateway_unavailable', detail: 'The Discord Gateway binding is not configured.' }, 503);
  let body: any = {};
  if (request.headers.get('content-type')?.includes('application/json')) {
    try { body = await request.json<any>(); }
    catch { return json({ error: 'invalid_json', detail: 'The Gateway request body is not valid JSON.' }, 400); }
  }
  const force = body.force === true;
  if (force) {
    if (guild?.owner !== true) return json({ error: 'owner_only', detail: 'Only the Discord server owner can clear a terminal Gateway safety halt.' }, 403);
    if (String(body.confirmation || '') !== 'RETRY GATEWAY' || body.acknowledged !== true) {
      return json({ error: 'confirmation_required', detail: 'Review the Discord intent settings, acknowledge the warning, and type RETRY GATEWAY exactly.' }, 400);
    }
  }
  const id = env.GATEWAY.idFromName('discord');
  const endpoint = force ? 'https://gateway/start?force=1' : 'https://gateway/start';
  const response = await env.GATEWAY.get(id).fetch(endpoint, { method: 'POST' });
  const data = await response.json<any>();
  const recovery = data?.halt_reason === 'disallowed_intents' ? {
    required_intents: ['Server Members Intent', 'Message Content Intent'],
    developer_portal: 'https://discord.com/developers/applications',
    owner_only: true,
    confirmation_phrase: 'RETRY GATEWAY',
  } : null;
  if (force) await audit(env, guildId, null, 'gateway_force_retry_requested', { previous_halt_reason: body.previous_halt_reason || null, result_state: data?.state || null, result_halt_reason: data?.halt_reason || null }, actorId);
  return json({
    ...data,
    ...(recovery ? {
      recovery,
      detail: 'Discord rejected Orbit’s privileged intents. Enable Server Members Intent and Message Content Intent in the Discord Developer Portal, save, then use the owner-only guarded retry.',
    } : {}),
  }, response.status);
}

async function guildBootstrap(env: Env, guildId: string, guild: any): Promise<Response> {
  const [rolesResponse, channelsResponse, config, botMemberResponse, onboarding, features] = await Promise.all([
    discord(env, `/guilds/${guildId}/roles`),
    discord(env, `/guilds/${guildId}/channels`),
    env.DB.prepare('SELECT * FROM guild_config WHERE guild_id=?').bind(guildId).first<GuildConfigRow>(),
    discord(env, `/guilds/${guildId}/members/${env.DISCORD_CLIENT_ID}`),
    env.DB.prepare('SELECT community_type,completed_at,updated_at FROM guild_onboarding WHERE guild_id=?').bind(guildId).first(),
    env.DB.prepare('SELECT feature_key,enabled FROM guild_features WHERE guild_id=?').bind(guildId).all(),
  ]);
  if (rolesResponse.status === 401 || channelsResponse.status === 401) return json({ error: 'bot_token_invalid' }, 502);
  if (!rolesResponse.ok || !channelsResponse.ok || !botMemberResponse.ok) return json({ error: 'bot_not_in_guild', install_url: installUrl(env, guildId) }, 409);

  const roles = (await rolesResponse.json()) as any[];
  const channels = ((await channelsResponse.json()) as any[])
    .filter(channel => channel.type === 0 || channel.type === 5)
    .map(channel => ({ id: channel.id, name: channel.name, type: channel.type, parent_id: channel.parent_id }));
  const botMember = (await botMemberResponse.json()) as any;
  const botTopRole = Math.max(...roles.filter(role => botMember.roles.includes(role.id)).map(role => role.position), 0);
  return json({
    guild: { id: guild.id, name: guild.name, icon: guild.icon, owner: guild.owner },
    bot: { installed: true, top_role_position: botTopRole },
    roles,
    channels,
    config: config ?? {},
    modules: moduleCatalog,
    install_url: installUrl(env, guildId),
    onboarding: onboarding ?? null,
    features: features.results ?? [],
  });
}

async function guildOverview(env: Env, guildId: string): Promise<Response> {
  const [auditCount, queuedPosts, openTickets] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) count FROM audit_events WHERE guild_id=?').bind(guildId).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) count FROM scheduled_posts WHERE guild_id=? AND status='queued'").bind(guildId).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) count FROM tickets WHERE guild_id=? AND status IN ('open','claimed')").bind(guildId).first<{ count: number }>(),
  ]);
  return json({ audit_events: auditCount?.count ?? 0, queued_posts: queuedPosts?.count ?? 0, open_tickets: openTickets?.count ?? 0 });
}

async function saveAccessConfig(request: Request, env: Env, guildId: string, guildName: string, userId: string): Promise<Response> {
  const body = (await request.json()) as any;
  const rolesResponse = await discord(env, `/guilds/${guildId}/roles`);
  if (!rolesResponse.ok) return json({ error: 'discord_roles' }, 502);
  const roles = (await rolesResponse.json()) as any[];
  const selected: string[] = [body.rules_role_id, body.verified_role_id, body.combined_role_id];
  if (selected.some(id => !id) || new Set(selected).size !== 3) return json({ error: 'invalid_roles' }, 400);
  const roleMap = new Map<string, any>(roles.map(role => [role.id, role]));
  if (selected.some(id => !roleMap.has(id) || roleMap.get(id).managed || roleMap.get(id).name === '@everyone')) return json({ error: 'invalid_roles' }, 400);

  const botMemberResponse = await discord(env, `/guilds/${guildId}/members/${env.DISCORD_CLIENT_ID}`);
  if (!botMemberResponse.ok) return json({ error: 'bot_not_installed', install_url: installUrl(env, guildId) }, 409);
  const botMember = (await botMemberResponse.json()) as any;
  const botTop = Math.max(...roles.filter(role => botMember.roles.includes(role.id)).map(role => role.position), 0);
  if (selected.some(id => roleMap.get(id).position >= botTop)) return json({ error: 'role_hierarchy' }, 409);

  const updatedAt = Date.now();
  await env.DB.prepare(`INSERT INTO guild_config(guild_id,guild_name,rules_role_id,verified_role_id,combined_role_id,remove_combined_when_invalid,updated_by,updated_at,admin_log_channel_id,notify_combined_granted,notify_combined_removed,notify_rules_granted,notify_verified_granted)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET guild_name=excluded.guild_name,rules_role_id=excluded.rules_role_id,verified_role_id=excluded.verified_role_id,combined_role_id=excluded.combined_role_id,remove_combined_when_invalid=excluded.remove_combined_when_invalid,updated_by=excluded.updated_by,updated_at=excluded.updated_at,admin_log_channel_id=excluded.admin_log_channel_id,notify_combined_granted=excluded.notify_combined_granted,notify_combined_removed=excluded.notify_combined_removed,notify_rules_granted=excluded.notify_rules_granted,notify_verified_granted=excluded.notify_verified_granted`)
    .bind(guildId, guildName, body.rules_role_id, body.verified_role_id, body.combined_role_id, body.remove_combined_when_invalid ? 1 : 0, userId, updatedAt, body.admin_log_channel_id || null, body.notify_combined_granted ? 1 : 0, body.notify_combined_removed ? 1 : 0, body.notify_rules_granted ? 1 : 0, body.notify_verified_granted ? 1 : 0).run();
  return json({ ok: true, config: { ...body, guild_id: guildId, guild_name: guildName, updated_by: userId, updated_at: updatedAt } });
}

async function postRules(request: Request, env: Env, guildId: string): Promise<Response> {
  const body = (await request.json()) as any;
  const resources=await loadGuildResources(env,guildId,{channels:true});
  if(!resources.ok)return json(resources,resources.status);
  const invalid=validateChannelIds(resources,[body.channel_id]);
  if(invalid)return json(invalid,invalid.status);
  const response = await sendDiscordMessage(env,String(body.channel_id),{content:String(body.message||'Please read the server rules, then agree below to continue.').slice(0,2000),components:[{type:1,components:[{type:2,style:3,label:'I Agree to the Rules',custom_id:'orby_rules_agree'}]}]});
  return json({ ok: response.ok }, response.ok ? 200 : 400);
}

async function createVerification(request: Request, env: Env, guildId: string): Promise<Response> {
  const body = (await request.json()) as any;
  if (!body.user_id || !/^\d+$/.test(body.user_id)) return json({ error: 'invalid_user' }, 400);
  return json({ url: await createVerificationSession(env,guildId,String(body.user_id)) });
}

async function postVerification(request:Request,env:Env,guildId:string,actorId:string):Promise<Response>{
  const body=await request.json<any>();
  const channelId=String(body.channel_id||'');
  if(!/^\d+$/.test(channelId))return json({error:'invalid_channel',detail:'Select a Discord verification channel.'},400);
  const config=await env.DB.prepare('SELECT verified_role_id FROM guild_config WHERE guild_id=?').bind(guildId).first<any>();
  if(!config?.verified_role_id)return json({error:'verification_not_configured',detail:'Save the Rules, Verified, and Combined access roles before posting the verification panel.'},409);
  const channelResponse=await discord(env,`/channels/${channelId}`);
  if(!channelResponse.ok)return json({error:'channel_unavailable',detail:'Orbit cannot access that channel. Check View Channel permission.'},409);
  const channel=await channelResponse.json<any>();
  if(String(channel.guild_id)!==guildId||![0,5].includes(Number(channel.type)))return json({error:'invalid_channel',detail:'Select a text or announcement channel from this server.'},400);
  const requestedMessage=String(body.message||'').trim();
  const content=(requestedMessage||'Complete human verification below to unlock server access.').slice(0,2000);
  const sent=await sendDiscordMessage(env,channelId,{content,components:[{type:1,components:[{type:2,style:1,label:'Verify with Orbit',custom_id:'orby_verify_start'}]}]});
  if(!sent.ok){let detail=`Discord returned HTTP ${sent.status}.`;try{const error=await sent.clone().json<any>();detail=error?.message||detail}catch{}return json({error:'verification_panel_failed',detail},sent.status===403?403:502)}
  const message=await sent.json<any>();
  await audit(env,guildId,null,'verification_panel_posted',{channel_id:channelId,message_id:message.id},actorId);
  return json({ok:true,message_id:message.id,channel_id:channelId});
}
