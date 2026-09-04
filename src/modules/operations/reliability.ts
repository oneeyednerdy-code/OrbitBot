import type { Env } from '../../types';
import { discord, getDiscordRateLimitStatus } from '../../discord/client';
import { permissionDoctor, PERMISSION_BITS } from '../../discord/permissions';
import { json } from '../../http/responses';
import { createActionJob, listActionJobs, recordResourceBinding, updateActionJob } from '../../repositories/action-jobs';
import { audit } from '../../repositories/audit';
import { captureConfigBackup, listConfigBackups, readConfigBackup, restoreConfigBackup, validateConfigBackup } from '../../repositories/config-backups';

const CORE_PERMISSIONS = ['view_channel', 'send_messages', 'manage_roles', 'manage_channels', 'create_events'] as const;

export async function reliabilityApi(request: Request, env: Env, guildId: string, actorId: string): Promise<Response> {
  if (request.method === 'GET') {
    const backupId = Number(new URL(request.url).searchParams.get('backup_id') || 0);
    if (backupId) {
      const backup = await readConfigBackup(env, guildId, backupId);
      return backup ? json({ backup }) : json({ error: 'config_backup_not_found' }, 404);
    }
    return json(await reliabilitySnapshot(env, guildId, actorId));
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let body: any = {};
  try { body = await request.json<any>(); } catch { return json({ error: 'invalid_json' }, 400); }
  if (body.op === 'preflight') return preflight(env, guildId, body);
  if (body.op === 'create_config_backup') return createBackup(env, guildId, actorId, body);
  if (body.op === 'restore_config_backup') return restoreBackup(env, guildId, actorId, Number(body.backup_id), body.confirmation, Boolean(body.acknowledged));
  if (body.op === 'restore_config_file') return restoreUploadedBackup(env, guildId, actorId, body.backup_json, body.confirmation, Boolean(body.acknowledged));
  if (body.op === 'scan' || !body.op) return json(await reliabilitySnapshot(env, guildId, actorId, true));
  return json({ error: 'invalid_operation' }, 400);
}

async function preflight(env: Env, guildId: string, body: any): Promise<Response> {
  const [rolesResponse, memberResponse] = await Promise.all([
    discord(env, `/guilds/${guildId}/roles`),
    discord(env, `/guilds/${guildId}/members/${env.DISCORD_CLIENT_ID}`),
  ]);
  if (!rolesResponse.ok || !memberResponse.ok) return json({ error: 'discord_resources_unavailable', detail: 'Orbit could not read the server roles and bot member record. Check the bot token and try again.' }, 502);
  const roles = await rolesResponse.json<any[]>();
  const botMember = await memberResponse.json<any>();
  let channel: any = null;
  if (body.channel_id) {
    const channelResponse = await discord(env, `/channels/${String(body.channel_id)}`);
    if (!channelResponse.ok) return json({ error: 'channel_unavailable', detail: 'Discord could not read that channel. It may have been deleted or the bot may lack access.' }, 400);
    channel = await channelResponse.json<any>();
    if (String(channel.guild_id) !== guildId) return json({ error: 'channel_not_in_guild', detail: 'The selected channel does not belong to this server.' }, 400);
  }
  const requested = Array.isArray(body.required_permissions) ? body.required_permissions.filter((value: any): value is keyof typeof PERMISSION_BITS => Object.prototype.hasOwnProperty.call(PERMISSION_BITS, value)) : [...CORE_PERMISSIONS];
  const targetRoleIds = Array.isArray(body.target_role_ids) ? body.target_role_ids.map(String).filter((value: string) => /^\d+$/.test(value)) : [];
  return json({ ok: true, permission_doctor: permissionDoctor({ guildId, roles, botMember, channel, requiredPermissions: requested, targetRoleIds }) });
}

export async function reliabilitySnapshot(env: Env, guildId: string, actorId: string, persist = false): Promise<any> {
  const [rolesResponse, memberResponse, channelsResponse, actionJobs, recentErrors, configBackups] = await Promise.all([
    discord(env, `/guilds/${guildId}/roles`),
    discord(env, `/guilds/${guildId}/members/${env.DISCORD_CLIENT_ID}`),
    discord(env, `/guilds/${guildId}/channels`),
    safeActionJobs(env, guildId),
    safeRecentErrors(env, guildId),
    safeConfigBackups(env, guildId),
  ]);
  const roles = rolesResponse.ok ? await rolesResponse.json<any[]>() : [];
  const botMember = memberResponse.ok ? await memberResponse.json<any>() : { roles: [], user: { id: env.DISCORD_CLIENT_ID } };
  const channels = channelsResponse.ok ? await channelsResponse.json<any[]>() : [];
  const doctor = permissionDoctor({ guildId, roles, botMember, requiredPermissions: [...CORE_PERMISSIONS] });
  const drift = await scanResourceDrift(env, guildId, channels, roles);
  const schema = await schemaStatus(env);
  const gateway = await gatewayStatus(env);
  const checks = [
    check('discord_api', rolesResponse.ok && memberResponse.ok && channelsResponse.ok, 'Discord API', rolesResponse.ok && memberResponse.ok && channelsResponse.ok ? 'Roles, bot membership, and channels are readable.' : 'Orbit could not read one or more Discord resources.'),
    check('permissions', doctor.ok, 'Orbit permissions', doctor.ok ? 'Core Orbit permissions are available.' : `Missing: ${doctor.blocking.join(', ')}.`),
    check('queue', Boolean(env.JOBS), 'Job queue', env.JOBS ? 'Queue binding is available.' : 'Queue binding is missing; background operations cannot run.'),
    check('gateway', gateway?.state === 'ready' || gateway?.state === 'handshaking' || gateway?.state === 'connecting', 'Gateway supervisor', gateway ? `Gateway state: ${gateway.state}.` : 'Gateway status is unavailable.'),
    check('schema', schema.missing.length === 0, 'Reliability schema', schema.missing.length ? `Missing tables: ${schema.missing.join(', ')}.` : 'Action history, resource drift, rate-limit, and error tables are available.'),
    check('resource_drift', drift.missing.length === 0, 'Configured resources', drift.missing.length ? `${drift.missing.length} configured Discord reference(s) are missing.` : 'Configured channels and roles still exist.'),
  ];
  const score = Math.round((checks.filter(item => item.ok).length / checks.length) * 100);
  const result = {
    score,
    status: score === 100 ? 'healthy' : score >= 67 ? 'attention' : 'critical',
    checks,
    permission_doctor: doctor,
    gateway,
    queue: { configured: Boolean(env.JOBS) },
    schema,
    resource_drift: drift,
    action_jobs: actionJobs,
    config_backups: configBackups,
    rate_limits: getDiscordRateLimitStatus(),
    recent_failures: recentErrors.filter((error: any) => Number(error.created_at) >= Date.now() - 60 * 60_000),
    error_history: recentErrors,
    actor_user_id: actorId,
    persisted: persist,
    generated_at: Date.now(),
  };
  if (persist) {
    try {
      await env.DB.prepare('INSERT INTO diagnostic_runs(guild_id,requested_by,status,result_json,created_at,completed_at) VALUES(?,?,?,?,?,?)')
        .bind(guildId, actorId, result.status, JSON.stringify(result), Date.now(), Date.now()).run();
    } catch {}
  }
  return result;
}

async function createBackup(env: Env, guildId: string, actorId: string, body: any): Promise<Response> {
  try {
    const payload = await captureConfigBackup(env, guildId);
    const serialized = JSON.stringify(payload);
    const name = String(body.name || `Orbit configuration ${new Date().toISOString().slice(0, 10)}`).trim().slice(0, 120) || 'Orbit configuration backup';
    const result = await env.DB.prepare('INSERT INTO orbit_config_backups(guild_id,name,version,payload_json,byte_size,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(guildId, name, payload.version, serialized, new TextEncoder().encode(serialized).byteLength, actorId, Date.now(), Date.now() + 180 * 86400000).run();
    const id = Number(result.meta.last_row_id);
    await audit(env, guildId, null, 'configuration_backup_created', { backup_id: id, name, byte_size: serialized.length }, actorId);
    return json({ ok: true, backup_id: id, name, byte_size: serialized.length });
  } catch (error: any) {
    if (String(error?.message || error) === 'config_backup_too_large') return json({ error: 'config_backup_too_large', detail: 'Orbit configuration is larger than the safe backup size. Remove unused old banks or split the configuration before trying again.' }, 413);
    throw error;
  }
}

async function restoreBackup(env: Env, guildId: string, actorId: string, backupId: number, confirmation: unknown, acknowledged: boolean): Promise<Response> {
  if (!Number.isFinite(backupId) || backupId <= 0) return json({ error: 'invalid_config_backup_id' }, 400);
  const backup = await readConfigBackup(env, guildId, backupId);
  if (!backup) return json({ error: 'config_backup_not_found' }, 404);
  return restorePayload(env, guildId, actorId, backup.payload, confirmation, acknowledged, backupId);
}

async function restoreUploadedBackup(env: Env, guildId: string, actorId: string, rawPayload: unknown, confirmation: unknown, acknowledged: boolean): Promise<Response> {
  let payload: any = rawPayload;
  if (typeof rawPayload === 'string') { try { payload = JSON.parse(rawPayload); } catch { return json({ error: 'invalid_config_backup', detail: 'The uploaded file is not valid JSON.' }, 400); } }
  return restorePayload(env, guildId, actorId, payload, confirmation, acknowledged, null);
}

async function restorePayload(env: Env, guildId: string, actorId: string, payload: any, confirmation: unknown, acknowledged: boolean, backupId: number | null): Promise<Response> {
  const validation = validateConfigBackup(payload, guildId);
  if (!validation.ok) return json({ error: 'invalid_config_backup', detail: validation.detail }, 400);
  const phrase = `RESTORE CONFIG${backupId ? ` ${backupId}` : ''}`;
  if (String(confirmation || '') !== phrase) return json({ error: 'confirmation_required', detail: `Type ${phrase} exactly.` }, 400);
  if (!acknowledged) return json({ error: 'acknowledgement_required', detail: 'Confirm that you reviewed the backup and intend to replace current Orbit settings.' }, 400);
  let actionJobId: number | null = null;
  try {
    actionJobId = await createActionJob(env, { guildId, module: 'configuration', action: backupId ? 'restore' : 'restore-upload', actorUserId: actorId, request: { backup_id: backupId, table_count: validation.tables.length } });
    await updateActionJob(env, actionJobId, { status: 'running', started: true, progress: { tables: validation.tables.length, rows: validation.tables.reduce((sum, table) => sum + table.rows.length, 0) } });
    const result = await restoreConfigBackup(env, guildId, validation.tables);
    await updateActionJob(env, actionJobId, { status: 'completed', finished: true, progress: result });
    await audit(env, guildId, null, 'configuration_restored', { backup_id: backupId, tables: result.tables, rows: result.rows }, actorId);
    return json({ ok: true, ...result, action_job_id: actionJobId });
  } catch (error: any) {
    if (actionJobId) try { await updateActionJob(env, actionJobId, { status: 'failed', finished: true, errorCode: 'configuration_restore_failed' }); } catch {}
    return json({ error: 'configuration_restore_failed', detail: 'Orbit could not restore the configuration. Current settings may be partially updated; run Reliability again and review the Action Center.', action_job_id: actionJobId, cause: String(error?.message || error).slice(0, 180) }, 500);
  }
}

async function gatewayStatus(env: Env): Promise<any> {
  if (!env.GATEWAY) return null;
  try {
    const id = env.GATEWAY.idFromName('discord');
    const response = await env.GATEWAY.get(id).fetch('https://gateway/status');
    return response.ok ? await response.json<any>() : null;
  } catch { return null; }
}

async function schemaStatus(env: Env): Promise<{ required: string[]; missing: string[] }> {
  const required = ['orbit_action_jobs', 'orbit_action_events', 'orbit_resource_bindings', 'orbit_rate_limit_buckets', 'orbit_error_log', 'channel_manager_jobs'];
  try {
    const placeholders = required.map(() => '?').join(',');
    const rows = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`).bind(...required).all<any>();
    const present = new Set(rows.results.map((row: any) => row.name));
    return { required, missing: required.filter(name => !present.has(name)) };
  } catch { return { required, missing: required }; }
}

async function safeActionJobs(env: Env, guildId: string): Promise<any[]> {
  try { return await listActionJobs(env, guildId, 30); } catch { return []; }
}

async function safeConfigBackups(env: Env, guildId: string): Promise<any[]> {
  try { return await listConfigBackups(env, guildId); } catch { return []; }
}

async function safeRecentErrors(env: Env, guildId: string): Promise<any[]> {
  try {
    const rows = await env.DB.prepare('SELECT request_id,route,method,status,error_code,detail_json,created_at FROM orbit_error_log WHERE guild_id=? ORDER BY created_at DESC LIMIT 30').bind(guildId).all<any>();
    return rows.results.map((row: any) => ({ request_id: row.request_id, route: row.route, method: row.method, status: row.status, error_code: row.error_code, detail: safeJson(row.detail_json), created_at: row.created_at }));
  } catch { return []; }
}

type Binding = { resourceType: 'channel' | 'role'; resourceId: string; module: string; bindingKey: string; label: string };

async function scanResourceDrift(env: Env, guildId: string, channels: any[], roles: any[]) {
  const bindings = await configuredBindings(env, guildId);
  const channelIds = new Set(channels.map(channel => String(channel.id)));
  const roleIds = new Set(roles.map(role => String(role.id)));
  const missing: any[] = [];
  const active: any[] = [];
  await Promise.all(bindings.map(async binding => {
    const exists = binding.resourceType === 'channel' ? channelIds.has(binding.resourceId) : roleIds.has(binding.resourceId);
    const row = { ...binding, status: exists ? 'active' : 'missing' };
    if (exists) active.push(row); else missing.push(row);
    try {
      await recordResourceBinding(env, { guildId, ...binding, status: exists ? 'active' : 'missing', error: exists ? null : 'Discord resource no longer exists.' });
    } catch {}
  }));
  return { checked: bindings.length, active, missing };
}

async function configuredBindings(env: Env, guildId: string): Promise<Binding[]> {
  const out: Binding[] = [];
  const add = (resourceType: Binding['resourceType'], resourceId: any, module: string, bindingKey: string, label: string) => {
    const id = String(resourceId || '');
    if (/^\d+$/.test(id)) out.push({ resourceType, resourceId: id, module, bindingKey, label });
  };
  const rows = async (sql: string) => { try { return (await env.DB.prepare(sql).bind(guildId).all<any>()).results; } catch { return []; } };
  for (const row of await rows('SELECT admin_log_channel_id,rules_role_id,verified_role_id,combined_role_id FROM guild_config WHERE guild_id=?')) {
    add('channel', row.admin_log_channel_id, 'settings', 'admin_log_channel', 'Admin log channel');
    add('role', row.rules_role_id, 'verification', 'rules_role', 'Rules role');
    add('role', row.verified_role_id, 'verification', 'verified_role', 'Verified role');
    add('role', row.combined_role_id, 'verification', 'combined_role', 'Combined access role');
  }
  for (const row of await rows('SELECT welcome_channel_id,goodbye_channel_id,autorole_id FROM community_configs WHERE guild_id=?')) {
    add('channel', row.welcome_channel_id, 'community', 'welcome_channel', 'Welcome channel');
    add('channel', row.goodbye_channel_id, 'community', 'goodbye_channel', 'Goodbye channel');
    add('role', row.autorole_id, 'community', 'autorole', 'Auto-role');
  }
  for (const row of await rows('SELECT channel_id FROM role_panels WHERE guild_id=? AND enabled=1')) add('channel', row.channel_id, 'roles', `role_panel:${row.channel_id}`, 'Role panel channel');
  for (const row of await rows('SELECT discord_category_id,panel_channel_id FROM ticket_categories WHERE guild_id=? AND enabled=1')) {
    add('channel', row.discord_category_id, 'tickets', `ticket_category:${row.discord_category_id}`, 'Ticket category');
    add('channel', row.panel_channel_id, 'tickets', `ticket_panel:${row.panel_channel_id}`, 'Ticket panel channel');
  }
  for (const row of await rows("SELECT channel_id,content_json FROM scheduled_posts WHERE guild_id=? AND status IN ('queued','sending')")) {
    add('channel', row.channel_id, 'scheduler', `scheduled_post:${row.channel_id}`, 'Scheduled post channel');
    add('role', safeJson(row.content_json).ping_role_id, 'scheduler', `scheduled_post_ping:${safeJson(row.content_json).ping_role_id}`, 'Scheduled post ping role');
  }
  for (const row of await rows('SELECT announce_channel_id FROM leveling_configs WHERE guild_id=?')) add('channel', row.announce_channel_id, 'leveling', 'announce_channel', 'Level-up announcement channel');
  for (const row of await rows('SELECT role_id FROM level_rewards WHERE guild_id=?')) add('role', row.role_id, 'leveling', `reward_role:${row.role_id}`, 'Level reward role');
  for (const row of await rows('SELECT discord_channel_id,mention_role_id FROM creator_sources WHERE guild_id=? AND enabled=1')) {
    add('channel', row.discord_channel_id, 'creator', `creator_channel:${row.discord_channel_id}`, 'Creator alert channel');
    add('role', row.mention_role_id, 'creator', `creator_mention:${row.mention_role_id}`, 'Creator mention role');
  }
  for (const row of await rows('SELECT discord_channel_id,required_role_id,mention_role_id FROM creator_role_alert_configs WHERE guild_id=?')) {
    add('channel', row.discord_channel_id, 'creator', 'role_alert_channel', 'Role-gated alert channel');
    add('role', row.required_role_id, 'creator', 'role_alert_required', 'Role-gated required role');
    add('role', row.mention_role_id, 'creator', 'role_alert_mention', 'Role-gated mention role');
  }
  for (const row of await rows('SELECT discord_channel_id,ping_role_id FROM community_events WHERE guild_id=? AND status=\'scheduled\'')) {
    add('channel', row.discord_channel_id, 'events', `event_channel:${row.discord_channel_id}`, 'Event announcement channel');
    add('role', row.ping_role_id, 'events', `event_ping:${row.ping_role_id}`, 'Event ping role');
  }
  for (const row of await rows('SELECT destination_channel_id,staff_role_id FROM application_forms WHERE guild_id=? AND enabled=1')) {
    add('channel', row.destination_channel_id, 'applications', `application_channel:${row.destination_channel_id}`, 'Application destination');
    add('role', row.staff_role_id, 'applications', `application_staff:${row.staff_role_id}`, 'Application staff role');
  }
  for (const row of await rows('SELECT default_channel_id FROM kofi_integrations WHERE guild_id=?')) add('channel', row.default_channel_id, 'kofi', 'default_channel', 'Ko-fi destination');
  for (const row of await rows('SELECT discord_channel_id FROM social_integrations WHERE guild_id=? AND enabled=1')) add('channel', row.discord_channel_id, 'social', `social_channel:${row.discord_channel_id}`, 'Social destination');
  for (const row of await rows('SELECT channel_id FROM sticky_configs WHERE guild_id=? AND enabled=1')) add('channel', row.channel_id, 'community', `sticky_channel:${row.channel_id}`, 'Sticky message channel');
  const jsonTables: Array<[string, string, string]> = [
    ['honeypot_configs', 'channel_id', 'Honeypot channel'], ['honeypot_configs', 'log_channel_id', 'Honeypot log channel'],
    ['security_configs', 'alert_channel_id', 'Security alert channel'], ['shield_configs', 'alert_channel_id', 'Shield alert channel'],
    ['creator_safety_configs', 'alert_channel_id', 'Creator safety alert channel'],
  ];
  for (const [table, field, label] of jsonTables) for (const row of await rows(`SELECT ${field} FROM ${table} WHERE guild_id=?`)) add('channel', row[field], table.replace('_configs', ''), field, label);
  return dedupe(out);
}

function dedupe(value: Binding[]): Binding[] {
  const seen = new Set<string>();
  return value.filter(binding => { const key = `${binding.resourceType}:${binding.module}:${binding.bindingKey}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
function check(code: string, ok: boolean, label: string, detail: string) { return { code, ok, label, detail, severity: ok ? 'ok' : 'warning' }; }
function safeJson(raw: any) { try { return JSON.parse(raw || '{}'); } catch { return { raw: String(raw || '').slice(0, 500) }; } }
