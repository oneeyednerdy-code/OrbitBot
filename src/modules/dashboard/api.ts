import type { Env, GuildConfigRow, SessionRow } from '../../types';
import { installUrl } from '../../auth/oauth';
import { discord } from '../../discord/client';
import { canManageGuild } from '../../discord/permissions';
import { json } from '../../http/responses';
import { openSeal, randomToken, sha256 } from '../../security/crypto';
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
import { onboardingApi } from '../onboarding/api';
import { connectionsApi } from '../connections/api';
import { bugReportsApi } from '../bug-reports/api';

export async function listManageableGuilds(env: Env, session: SessionRow): Promise<Response> {
  let token: string;
  try { token = await openSeal(session.access_token, env.SESSION_SECRET); } catch { return json({ error: 'unauthorized' }, 401); }
  const response = await discord(env, '/users/@me/guilds', {}, token);
  if (!response.ok) return json({ error: 'discord' }, 502);
  const guilds = ((await response.json()) as any[]).filter(guild => canManageGuild(guild.permissions));
  return json(guilds.map(guild => ({ id: guild.id, name: guild.name, icon: guild.icon, owner: guild.owner })));
}

export async function handleGuildApi(request: Request, env: Env, guildId: string, action: string, guild: any, session: SessionRow): Promise<Response> {
  if (action === 'bootstrap' && request.method === 'GET') return guildBootstrap(env, guildId, guild);
  if (action === 'overview' && request.method === 'GET') return guildOverview(env, guildId);
  if (action === 'config' && request.method === 'GET') return json((await env.DB.prepare('SELECT * FROM guild_config WHERE guild_id=?').bind(guildId).first()) ?? {});
  if (action === 'config' && request.method === 'POST') return saveAccessConfig(request, env, guildId, guild.name, session.user_id);
  if (action === 'post-rules' && request.method === 'POST') return postRules(request, env);
  if (action === 'create-verification' && request.method === 'POST') return createVerification(request, env, guildId);
  if (action === 'diagnostics' && request.method === 'GET') return diagnosticsApi(env, guildId, session.user_id, false);
  if (action === 'diagnostics' && request.method === 'POST') return diagnosticsApi(env, guildId, session.user_id, true);
  if (action === 'logs' && request.method === 'GET') return logsApi(env, guildId);
  if (action === 'moderation') return moderationApi(request, env, guildId, session.user_id);
  if (action === 'roles') return rolesApi(request, env, guildId, session.user_id);
  if (action === 'tickets') return ticketsApi(request, env, guildId);
  if (action === 'scheduler') return schedulerApi(request, env, guildId, session.user_id);
  if (action === 'leveling') return levelingApi(request, env, guildId);
  if (action === 'automation') return automationApi(request, env, guildId, session.user_id);
  if (action === 'community') return communityApi(request, env, guildId, session.user_id);
  if (action === 'kofi') return kofiApi(request, env, guildId);
  if (action === 'creator') return creatorApi(request, env, guildId);
  if (action === 'social') return socialApi(request, env, guildId, session.user_id);
  if (action === 'security') return securityApi(request, env, guildId, session.user_id);
  if (action === 'shield') return shieldApi(request, env, guildId, session.user_id);
  if (action === 'creator-directory') return creatorDirectoryApi(request, env, guildId);
  if (action === 'events') return eventsApi(request, env, guildId, session.user_id);
  if (action === 'applications') return applicationsApi(request, env, guildId);
  if (action === 'health') return communityHealthApi(request, env, guildId);
  if (action === 'creator-safety') return creatorSafetyApi(request, env, guildId, session.user_id);
  if (action === 'operations') return operationsApi(request, env, guildId);
  if (action === 'onboarding') return onboardingApi(request, env, guildId, session.user_id);
  if (action === 'connections') return connectionsApi(request, env, guildId);
  if (action === 'bug-reports') return bugReportsApi(request, env, guildId, session.user_id);
  if (action === 'start-gateway' && request.method === 'POST') { const id=env.GATEWAY.idFromName('discord'); await env.GATEWAY.get(id).fetch('https://gateway/start',{method:'POST'}); return json({ok:true}); }
  return json({ error: 'bad_request' }, 400);
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

async function postRules(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as any;
  const response = await discord(env, `/channels/${body.channel_id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: body.message || 'Please read the server rules, then agree below to continue.', components: [{ type: 1, components: [{ type: 2, style: 3, label: 'I Agree to the Rules', custom_id: 'orby_rules_agree' }] }] }),
  });
  return json({ ok: response.ok }, response.ok ? 200 : 400);
}

async function createVerification(request: Request, env: Env, guildId: string): Promise<Response> {
  const body = (await request.json()) as any;
  if (!body.user_id || !/^\d+$/.test(body.user_id)) return json({ error: 'invalid_user' }, 400);
  const token = randomToken();
  const hash = await sha256(token);
  await env.DB.prepare('INSERT INTO verification_sessions VALUES(?,?,?,?,?,?)').bind(hash, guildId, body.user_id, Date.now() + 15 * 60_000, null, Date.now()).run();
  return json({ url: `${env.APP_ORIGIN}/verify/${token}` });
}
