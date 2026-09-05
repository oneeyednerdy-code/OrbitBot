import type { Env } from '../../types';
import { json } from '../../http/responses';

const DEFAULT_WRONG_MESSAGE = 'That was not the next number. The count resets to {count}. Expected {expected}, received {received}.';
const DEFAULT_SAME_USER_MESSAGE = 'Let someone else count next, {user}.';

export async function countingApi(request: Request, env: Env, guildId: string, actorId: string): Promise<Response> {
  if (request.method === 'GET') {
    const [config, activity] = await Promise.all([
      env.DB.prepare('SELECT * FROM counting_configs WHERE guild_id=?').bind(guildId).first(),
      env.DB.prepare('SELECT * FROM counting_activity WHERE guild_id=? ORDER BY created_at DESC LIMIT 50').bind(guildId).all(),
    ]);
    return json({ config: config ?? defaultConfig(), activity: activity.results });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const body = await request.json<any>();
  const operation = String(body.op || 'save');
  const now = Date.now();

  if (operation === 'reset' || operation === 'start' || operation === 'stop' || operation === 'continue') {
    const existing = await env.DB.prepare('SELECT * FROM counting_configs WHERE guild_id=?').bind(guildId).first<any>();
    if (!existing) return json({ error: 'counting_not_configured', detail: 'Save the counting channel and rules before using this control.' }, 409);
    if ((operation === 'start' || operation === 'continue') && !/^\d+$/.test(String(existing.channel_id || ''))) return json({ error: 'counting_channel_required', detail: 'Choose a Discord text channel before enabling counting.' }, 400);
    if (operation === 'reset') {
      await env.DB.prepare(`UPDATE counting_configs SET current_number=start_number,last_user_id=NULL,last_message_id=NULL,updated_by=?,updated_at=? WHERE guild_id=?`).bind(actorId, now, guildId).run();
    } else {
      const enabled = operation === 'stop' ? 0 : 1;
      await env.DB.prepare('UPDATE counting_configs SET enabled=?,updated_by=?,updated_at=? WHERE guild_id=?').bind(enabled, actorId, now, guildId).run();
    }
    return json({ ok: true });
  }

  if (operation !== 'save') return json({ error: 'unknown_operation' }, 400);
  const channelId = String(body.channel_id || '');
  const startNumber = Number(body.start_number);
  const enabled = Boolean(body.enabled);
  if (enabled && !/^\d+$/.test(channelId)) return json({ error: 'counting_channel_required', detail: 'Choose a Discord text channel before enabling counting.' }, 400);
  if (!Number.isSafeInteger(startNumber) || startNumber < -1_000_000_000_000 || startNumber > 1_000_000_000_000) return json({ error: 'invalid_start_number', detail: 'The starting number must be a safe integer between -1 trillion and 1 trillion.' }, 400);
  const wrongMessage = String(body.wrong_message ?? DEFAULT_WRONG_MESSAGE).trim().slice(0, 2000);
  const sameUserMessage = String(body.same_user_message ?? DEFAULT_SAME_USER_MESSAGE).trim().slice(0, 2000);
  const correctReaction = String(body.correct_reaction ?? '✅').trim().slice(0, 20);
  const wrongReaction = String(body.wrong_reaction ?? '❌').trim().slice(0, 20);
  if (wrongMessage.length > 2000 || sameUserMessage.length > 2000) return json({ error: 'message_too_long' }, 400);
  await env.DB.prepare(`INSERT INTO counting_configs(
      guild_id,enabled,channel_id,start_number,current_number,require_alternating,numbers_only,reset_on_mistake,
      delete_invalid_messages,correct_reaction,wrong_reaction,wrong_message,same_user_message,last_user_id,last_message_id,
      correct_count,mistake_count,highest_number,last_mistake_at,updated_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,0,0,?,?,?,?,?)
    ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled,channel_id=excluded.channel_id,start_number=excluded.start_number,
      current_number=excluded.current_number,require_alternating=excluded.require_alternating,numbers_only=excluded.numbers_only,
      reset_on_mistake=excluded.reset_on_mistake,delete_invalid_messages=excluded.delete_invalid_messages,
      correct_reaction=excluded.correct_reaction,wrong_reaction=excluded.wrong_reaction,wrong_message=excluded.wrong_message,
      same_user_message=excluded.same_user_message,last_user_id=NULL,last_message_id=NULL,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(guildId, enabled ? 1 : 0, channelId || null, startNumber, startNumber, body.require_alternating !== false ? 1 : 0,
      body.numbers_only !== false ? 1 : 0, body.reset_on_mistake !== false ? 1 : 0, body.delete_invalid_messages ? 1 : 0,
      correctReaction || '✅', wrongReaction || '❌', wrongMessage || DEFAULT_WRONG_MESSAGE, sameUserMessage || DEFAULT_SAME_USER_MESSAGE,
      startNumber, null, actorId, now, now).run();
  return json({ ok: true, reset_to: startNumber });
}

function defaultConfig() {
  return { enabled: 0, channel_id: null, start_number: 1, current_number: 1, require_alternating: 1, numbers_only: 1, reset_on_mistake: 1, delete_invalid_messages: 0, correct_reaction: '✅', wrong_reaction: '❌', wrong_message: DEFAULT_WRONG_MESSAGE, same_user_message: DEFAULT_SAME_USER_MESSAGE, correct_count: 0, mistake_count: 0, highest_number: 1 };
}
