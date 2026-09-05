import type { Env } from '../../types';
import { json } from '../../http/responses';
import { discord } from '../../discord/client';

const DEFAULT_MESSAGE = '🎂 Happy birthday, {user}! We hope you have a wonderful day!';
export async function birthdaysApi(request: Request, env: Env, guildId: string, actorId: string): Promise<Response> {
  if (request.method === 'GET') {
    const [config, mine, entries] = await Promise.all([
      env.DB.prepare('SELECT * FROM birthday_configs WHERE guild_id=?').bind(guildId).first(),
      env.DB.prepare('SELECT id,month,day,enabled,updated_at FROM birthday_entries WHERE guild_id=? AND user_id=?').bind(guildId, actorId).first(),
      env.DB.prepare('SELECT id,user_id,month,day,enabled,updated_at FROM birthday_entries WHERE guild_id=? ORDER BY month,day,user_id').bind(guildId).all(),
    ]);
    return json({ config: config ?? { enabled: 0, channel_id: null, ping_role_id: null, message: DEFAULT_MESSAGE, timezone: 'UTC' }, mine: mine ?? null, entries: entries.results });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const body = await request.json<any>(), op = String(body.op || 'save_mine'), now = Date.now();
  if (op === 'save_config') {
    const timezone = String(body.timezone || 'UTC');
    if (!validTimezone(timezone)) return json({ error: 'invalid_timezone', detail: 'Use a valid IANA timezone such as America/Chicago.' }, 400);
    if (body.enabled && !/^\d+$/.test(String(body.channel_id || ''))) return json({ error: 'birthday_channel_required' }, 400);
    const message = String(body.message || DEFAULT_MESSAGE).trim().slice(0, 2000);
    await env.DB.prepare(`INSERT INTO birthday_configs(guild_id,enabled,channel_id,ping_role_id,message,timezone,updated_by,updated_at,panel_channel_id,panel_message_id) VALUES(?,?,?,?,?,?,?,?,NULL,NULL)
      ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled,channel_id=excluded.channel_id,ping_role_id=excluded.ping_role_id,message=excluded.message,timezone=excluded.timezone,updated_by=excluded.updated_by,updated_at=excluded.updated_at,panel_channel_id=COALESCE(excluded.panel_channel_id,birthday_configs.panel_channel_id),panel_message_id=birthday_configs.panel_message_id`)
      .bind(guildId, body.enabled ? 1 : 0, body.channel_id || null, body.ping_role_id || null, message || DEFAULT_MESSAGE, timezone, actorId, now).run();
    return json({ ok: true });
  }
  if (op === 'save_mine' || op === 'save_entry') {
    const userId = op === 'save_mine' ? actorId : String(body.user_id || '');
    if (!/^\d+$/.test(userId)) return json({ error: 'user_id_required' }, 400);
    const month = Number(body.month), day = Number(body.day);
    if (!validBirthday(month, day)) return json({ error: 'invalid_birthday', detail: 'Choose a real month and day.' }, 400);
    await env.DB.prepare(`INSERT INTO birthday_entries(guild_id,user_id,month,day,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(guild_id,user_id) DO UPDATE SET month=excluded.month,day=excluded.day,enabled=excluded.enabled,updated_at=excluded.updated_at`).bind(guildId, userId, month, day, body.enabled === false ? 0 : 1, now, now).run();
    return json({ ok: true });
  }
  if (op === 'delete_mine' || op === 'delete_entry') {
    const userId = op === 'delete_mine' ? actorId : String(body.user_id || '');
    await env.DB.prepare('DELETE FROM birthday_entries WHERE guild_id=? AND user_id=?').bind(guildId, userId).run();
    return json({ ok: true });
  }
  if (op === 'toggle_entry') { await env.DB.prepare('UPDATE birthday_entries SET enabled=?,updated_at=? WHERE guild_id=? AND id=?').bind(body.enabled ? 1 : 0, now, guildId, Number(body.id)).run(); return json({ ok: true }); }
  if (op === 'post_panel') {
    const config = await env.DB.prepare('SELECT * FROM birthday_configs WHERE guild_id=?').bind(guildId).first<any>();
    const channelId = String(body.panel_channel_id || config?.panel_channel_id || '');
    if (!/^\d+$/.test(channelId)) return json({ error: 'birthday_panel_channel_required', detail: 'Choose a channel for the registration panel.' }, 400);
    const payload = { content: '🎂 **Birthday registration**\nUse the buttons below to privately register, update, or remove your birthday. Orbit stores only your month and day.', components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Register / Update Birthday', custom_id: 'orbit_birthday_register' }, { type: 2, style: 4, label: 'Remove My Birthday', custom_id: 'orbit_birthday_remove' }] }], allowed_mentions: { parse: [] } };
    const path = config?.panel_message_id && String(config.panel_channel_id) === channelId ? `/channels/${channelId}/messages/${config.panel_message_id}` : `/channels/${channelId}/messages`;
    const response = await discord(env, path, { method: config?.panel_message_id && String(config.panel_channel_id) === channelId ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    if (!response.ok) return json({ error: 'birthday_panel_failed', detail: `Discord returned HTTP ${response.status}.` }, 400);
    const message = await response.json<any>();
    await env.DB.prepare('UPDATE birthday_configs SET panel_channel_id=?,panel_message_id=?,updated_by=?,updated_at=? WHERE guild_id=?').bind(channelId, String(message.id), actorId, now, guildId).run();
    return json({ ok: true });
  }
  return json({ error: 'unknown_operation' }, 400);
}
function validBirthday(month: number, day: number): boolean { if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) return false; const date = new Date(2024, month - 1, day); return date.getFullYear() === 2024 && date.getMonth() === month - 1 && date.getDate() === day; }
function validTimezone(value: string): boolean { try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return true; } catch { return false; } }
