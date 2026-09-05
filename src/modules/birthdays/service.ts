import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { sendDiscordMessage } from '../../discord/messages';
import { isGuildMessageChannel } from '../../discord/guild-resources';

export async function birthdaySweep(env: Env): Promise<void> {
  let configs: any[] = [];
  try { configs = (await env.DB.prepare("SELECT * FROM birthday_configs WHERE enabled=1 AND channel_id IS NOT NULL").all()).results as any[]; } catch { return; }
  const now = Date.now();
  for (const config of configs.slice(0, 100)) {
    const parts = localDate(now, String(config.timezone || 'UTC'));
    if (!parts || !await isGuildMessageChannel(env, String(config.guild_id), String(config.channel_id))) continue;
    const entries = await env.DB.prepare('SELECT * FROM birthday_entries WHERE guild_id=? AND enabled=1 AND month=? AND day=? LIMIT 100').bind(config.guild_id, parts.month, parts.day).all<any>();
    for (const entry of entries.results) await announceBirthday(env, config, entry, parts.year, now);
  }
}

async function announceBirthday(env: Env, config: any, entry: any, year: number, now: number): Promise<void> {
  const claim = await env.DB.prepare(`INSERT INTO birthday_announcement_runs(guild_id,birthday_id,announcement_year,status,attempted_at)
    VALUES(?,?,?,'sending',?) ON CONFLICT(birthday_id,announcement_year) DO UPDATE SET status='sending',attempted_at=?,error_code=NULL
    WHERE status='failed' AND attempted_at<?`).bind(config.guild_id, entry.id, year, now, now, now - 15 * 60_000).run();
  if (!claim.meta.changes) return;
  const roleId = /^\d+$/.test(String(config.ping_role_id || '')) ? String(config.ping_role_id) : null;
  try {
    const response = await sendDiscordMessage(env, String(config.channel_id), {
      content: render(String(config.message || ''), String(entry.user_id), entry.month, entry.day),
      pingRoleIds: roleId ? [roleId] : [],
      pingUserIds: [String(entry.user_id)],
    });
    if (!response.ok) throw new Error(`discord_${response.status}`);
    const message = await response.clone().json<any>();
    await env.DB.prepare("UPDATE birthday_announcement_runs SET status='sent',discord_message_id=?,error_code=NULL WHERE birthday_id=? AND announcement_year=?").bind(String(message?.id || ''), entry.id, year).run();
  } catch (error) {
    await env.DB.prepare("UPDATE birthday_announcement_runs SET status='failed',error_code=? WHERE birthday_id=? AND announcement_year=?").bind(String(error instanceof Error ? error.message : error).slice(0, 100), entry.id, year).run();
  }
}

function localDate(timestamp: number, timezone: string): { year: number; month: number; day: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(timestamp));
    const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
    const year = value('year'), month = value('month'), day = value('day');
    return Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) ? { year, month, day } : null;
  } catch { return null; }
}

function render(template: string, userId: string, month: number, day: number): string {
  return template.replaceAll('{user}', `<@${userId}>`).replaceAll('{month}', String(month)).replaceAll('{day}', String(day)).slice(0, 2000);
}
