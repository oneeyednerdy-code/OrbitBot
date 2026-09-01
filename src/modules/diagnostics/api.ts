import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { json } from '../../http/responses';

const MANAGE_ROLES = 1n << 28n;
const SEND_MESSAGES = 1n << 11n;
const VIEW_CHANNEL = 1n << 10n;
const ADMINISTRATOR = 1n << 3n;
const CREATE_EVENTS = 1n << 44n;

export async function diagnosticsSnapshot(env: Env, guildId: string, requestedBy: string) {
  const checks: any[] = [];
  const rolesRes = await discord(env, `/guilds/${guildId}/roles`);
  const botRes = await discord(env, `/guilds/${guildId}/members/${env.DISCORD_CLIENT_ID}`);
  checks.push(check('discord_api', rolesRes.ok && botRes.ok, 'Discord API', rolesRes.ok && botRes.ok ? 'Connected and bot membership readable.' : 'Orbit could not read server roles or its member record.'));
  const config = await env.DB.prepare('SELECT * FROM guild_config WHERE guild_id=?').bind(guildId).first<any>();
  checks.push(check('turnstile', Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY), 'Turnstile', env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY ? 'Site key and server-side secret are configured.' : 'Turnstile configuration is incomplete.'));
  checks.push(check('d1', true, 'D1', 'Database request succeeded.'));
  const featureRows = await env.DB.prepare('SELECT feature_key FROM guild_features WHERE guild_id=? AND enabled=1').bind(guildId).all<any>();
  const enabled = new Set(featureRows.results.map((row:any)=>row.feature_key));
  if (enabled.has('scheduler') || enabled.has('automation') || enabled.has('social')) checks.push(check('queue', Boolean(env.JOBS), 'Job Queue', env.JOBS ? 'Orbit job queue binding is available.' : 'The job queue binding is missing. Scheduled or background work may fail.'));
  if (enabled.has('protection') || enabled.has('leveling') || enabled.has('creator_community')) {
    checks.push(check('gateway', Boolean(env.GATEWAY), 'Discord Gateway', env.GATEWAY ? 'Discord Gateway Durable Object binding is available.' : 'The Discord Gateway binding is missing.'));
    if (env.GATEWAY) {
      try {
        const id = env.GATEWAY.idFromName('discord');
        const gatewayResponse = await env.GATEWAY.get(id).fetch('https://gateway/status');
        const gateway = await gatewayResponse.json<any>();
        const healthy = gateway.state === 'ready' || gateway.state === 'handshaking' || gateway.state === 'connecting';
        const detail = gateway.state === 'halted'
          ? `Gateway halted safely: ${gateway.halt_reason || 'unknown'}. Orbit will not burn additional Discord IDENTIFY attempts.`
          : gateway.state === 'backoff'
            ? `Gateway is backing off safely until ${gateway.next_attempt_at ? new Date(gateway.next_attempt_at).toISOString() : 'the next retry window'}.`
            : `Gateway runtime state: ${gateway.state}.`;
        checks.push(check('gateway_runtime', healthy, 'Gateway runtime', detail));
        if (gateway.session_start_remaining != null) checks.push(check('gateway_identify_budget', Number(gateway.session_start_remaining) > 5, 'Gateway IDENTIFY budget', `${gateway.session_start_remaining} of ${gateway.session_start_total ?? '?'} session starts remain in Discord's current window.`));
      } catch {
        checks.push(check('gateway_runtime', false, 'Gateway runtime', 'Orbit could not read the Gateway runtime status.'));
      }
    }
  }
  if (enabled.has('alerts') || enabled.has('social')) {
    const connectionCount = await env.DB.prepare("SELECT COUNT(*) count FROM creator_account_connections WHERE guild_id=? AND status='connected'").bind(guildId).first<{count:number}>();
    checks.push(check('credential_encryption', Boolean(env.SOCIAL_CREDENTIAL_KEY), 'Connection encryption', env.SOCIAL_CREDENTIAL_KEY ? 'Server-side social credential encryption is configured.' : 'SOCIAL_CREDENTIAL_KEY is missing, so account connections are disabled.'));
    checks.push(check('creator_connections', Number(connectionCount?.count||0)>0, 'Creator connections', Number(connectionCount?.count||0)>0 ? `${connectionCount?.count} creator account connection(s) are active.` : 'No creator accounts are connected yet.'));
  }
  if (rolesRes.ok && botRes.ok) {
    const roles = await rolesRes.json<any[]>();
    const bot = await botRes.json<any>();
    const everyone = roles.find(r => r.id === guildId);
    let perms = BigInt(everyone?.permissions ?? '0');
    for (const role of roles) if (bot.roles?.includes(role.id)) perms |= BigInt(role.permissions ?? '0');
    checks.push(check('view_channel', Boolean(perms & VIEW_CHANNEL), 'View Channels', Boolean(perms & VIEW_CHANNEL) ? 'Orbit can view server channels.' : 'Orbit is missing View Channels.'));
    checks.push(check('send_messages', Boolean(perms & SEND_MESSAGES), 'Send Messages', Boolean(perms & SEND_MESSAGES) ? 'Orbit can send messages.' : 'Orbit is missing Send Messages.'));
    checks.push(check('manage_roles', Boolean((perms & ADMINISTRATOR) || (perms & MANAGE_ROLES)), 'Manage Roles', Boolean((perms & ADMINISTRATOR) || (perms & MANAGE_ROLES)) ? 'Orbit can manage assignable roles.' : 'Orbit is missing Manage Roles.'));
    if (enabled.has('creator_community')) checks.push(check('create_events', Boolean((perms & ADMINISTRATOR) || (perms & CREATE_EVENTS)), 'Create Events', Boolean((perms & ADMINISTRATOR) || (perms & CREATE_EVENTS)) ? 'Orbit can create Discord Scheduled Events.' : 'Orbit is missing the Create Events permission required for Discord Scheduled Events.'));
    const top = Math.max(...roles.filter(r => bot.roles?.includes(r.id)).map(r => r.position), 0);
    for (const [label,id] of [['Rules',config?.rules_role_id],['Verified',config?.verified_role_id],['Combined',config?.combined_role_id]] as const) {
      if (!id) continue;
      const role = roles.find(r => r.id === id);
      checks.push(check(`hierarchy_${label.toLowerCase()}`, Boolean(role && role.position < top), `${label} role hierarchy`, role && role.position < top ? `Orbit can manage ${role.name}.` : `${label} role is at or above Orbit's highest role.`));
    }
  }
  const score = Math.round((checks.filter(c=>c.ok).length / Math.max(checks.length,1)) * 100);
  const recentErrors = (await env.DB.prepare('SELECT request_id,route,method,status,error_code,detail_json,created_at FROM orbit_error_log WHERE guild_id=? ORDER BY created_at DESC LIMIT 20').bind(guildId).all<any>()).results.map((row:any)=>({request_id:row.request_id,route:row.route,method:row.method,status:row.status,error_code:row.error_code,detail:safeJson(row.detail_json),created_at:row.created_at}));
  const result = { score, status: score === 100 ? 'healthy' : score >= 75 ? 'attention' : 'critical', checks, recent_errors: recentErrors, generated_at: Date.now() };
  return result;
}

export async function diagnosticsApi(env: Env, guildId: string, requestedBy: string, persist = false): Promise<Response> {
  const result = await diagnosticsSnapshot(env, guildId, requestedBy);
  if (persist) await env.DB.prepare('INSERT INTO diagnostic_runs(guild_id,requested_by,status,result_json,created_at,completed_at) VALUES(?,?,?,?,?,?)').bind(guildId, requestedBy, result.status, JSON.stringify(result), Date.now(), Date.now()).run();
  return json(result);
}
function check(code:string, ok:boolean, label:string, detail:string){return {code,ok,label,detail,severity:ok?'ok':'warning'};}
function safeJson(value:string){try{return JSON.parse(value||'{}')}catch{return {raw:String(value||'').slice(0,1200)}}}
