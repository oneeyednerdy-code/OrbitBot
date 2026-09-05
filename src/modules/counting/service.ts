import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { sendDiscordMessage } from '../../discord/messages';

type CountingConfig = {
  guild_id: string;
  enabled: number;
  channel_id: string | null;
  start_number: number;
  current_number: number;
  require_alternating: number;
  numbers_only: number;
  reset_on_mistake: number;
  delete_invalid_messages: number;
  correct_reaction: string;
  wrong_reaction: string;
  wrong_message: string;
  same_user_message: string;
  last_user_id: string | null;
  last_message_id: string | null;
};

export async function handleCountingMessage(env: Env, event: any): Promise<void> {
  const guildId = String(event?.guild_id || '');
  const channelId = String(event?.channel_id || '');
  const userId = String(event?.author?.id || '');
  const messageId = String(event?.id || '');
  if (!/^\d+$/.test(guildId) || !/^\d+$/.test(channelId) || !/^\d+$/.test(userId) || !messageId || event?.author?.bot) return;

  let config: CountingConfig | null;
  try {
    config = await env.DB.prepare('SELECT * FROM counting_configs WHERE guild_id=? AND enabled=1 AND channel_id=?')
      .bind(guildId, channelId).first<CountingConfig>();
  } catch {
    // The handler must remain safe during a rolling migration.
    return;
  }
  if (!config) return;

  const parsed = parseNumber(String(event?.content || ''), Boolean(config.numbers_only));
  if (parsed == null) return;
  const expected = Number(config.current_number);
  const received = parsed;
  const now = Date.now();

  if (config.require_alternating && config.last_user_id === userId) {
    await recordActivity(env, { guildId, channelId, userId, messageId, expected, received, result: 'same_user', now });
    await react(env, channelId, messageId, config.wrong_reaction);
    if (config.same_user_message) {
      await postNotice(env, channelId, config.same_user_message, userId, { expected, received, count: expected });
    }
    return;
  }

  if (received === expected) {
    const next = safeInteger(received + 1, received);
    const result = await env.DB.prepare(`UPDATE counting_configs
      SET current_number=?, last_user_id=?, last_message_id=?, correct_count=correct_count+1,
          highest_number=MAX(highest_number,?), updated_at=?
      WHERE guild_id=? AND enabled=1 AND channel_id=? AND current_number=?
        AND (require_alternating=0 OR last_user_id IS NULL OR last_user_id<>?)`)
      .bind(next, userId, messageId, received, now, guildId, channelId, expected, userId).run();
    if (!result.meta.changes) return;
    await recordActivity(env, { guildId, channelId, userId, messageId, expected, received, result: 'correct', now });
    await react(env, channelId, messageId, config.correct_reaction);
    return;
  }

  const resetNumber = Number(config.start_number);
  const nextNumber = config.reset_on_mistake ? resetNumber : expected;
  const resetUser = config.reset_on_mistake ? null : config.last_user_id;
  const resetMessage = config.reset_on_mistake ? null : config.last_message_id;
  const result = await env.DB.prepare(`UPDATE counting_configs
    SET current_number=?, last_user_id=?, last_message_id=?, mistake_count=mistake_count+1,
        last_mistake_at=?, updated_at=?
    WHERE guild_id=? AND enabled=1 AND channel_id=? AND current_number=?`)
    .bind(nextNumber, resetUser, resetMessage, now, now, guildId, channelId, expected).run();
  if (!result.meta.changes) return;
  await recordActivity(env, { guildId, channelId, userId, messageId, expected, received, result: 'wrong', now });
  await react(env, channelId, messageId, config.wrong_reaction);
  if (config.delete_invalid_messages) {
    try { await discord(env, `/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' }); } catch {}
  }
  if (config.wrong_message) {
    await postNotice(env, channelId, config.wrong_message, userId, { expected, received, count: nextNumber });
  }
}

function parseNumber(content: string, numbersOnly: boolean): number | null {
  const value = numbersOnly ? content.trim() : content.trim().split(/\s+/, 1)[0];
  if (!/^-?\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function safeInteger(value: number, fallback: number): number {
  return Number.isSafeInteger(value) ? value : fallback;
}

function renderMessage(template: string, values: { user: string; expected: number; received: number; count: number }): string {
  return String(template)
    .replaceAll('{user}', values.user)
    .replaceAll('{expected}', String(values.expected))
    .replaceAll('{received}', String(values.received))
    .replaceAll('{count}', String(values.count))
    .slice(0, 2000);
}

async function react(env: Env, channelId: string, messageId: string, emoji: string): Promise<void> {
  if (!emoji) return;
  try {
    await discord(env, `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`, { method: 'PUT' });
  } catch {}
}

async function postNotice(env: Env, channelId: string, template: string, userId: string, values: { expected: number; received: number; count: number }): Promise<void> {
  try {
    await sendDiscordMessage(env, channelId, {
      content: renderMessage(template, { user: `<@${userId}>`, ...values }),
      pingUserIds: [userId],
    });
  } catch {}
}

async function recordActivity(env: Env, values: { guildId: string; channelId: string; userId: string; messageId: string; expected: number; received: number; result: string; now: number }): Promise<void> {
  try {
    await env.DB.prepare(`INSERT INTO counting_activity(guild_id,channel_id,user_id,message_id,expected_number,received_number,result,created_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(values.guildId, values.channelId, values.userId, values.messageId, values.expected, values.received, values.result, values.now).run();
    await env.DB.prepare(`DELETE FROM counting_activity WHERE guild_id=? AND id NOT IN
      (SELECT id FROM counting_activity WHERE guild_id=? ORDER BY created_at DESC LIMIT 500)`).bind(values.guildId, values.guildId).run();
  } catch {}
}
