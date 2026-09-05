import type { Env } from '../../types';

export async function handleBirthdayInteraction(env: Env, interaction: any): Promise<any | null> {
  const custom = String(interaction.data?.custom_id || ''), guildId = String(interaction.guild_id || ''), userId = String(interaction.member?.user?.id || interaction.user?.id || '');
  if (!/^\d+$/.test(guildId) || !/^\d+$/.test(userId)) return null;
  if (interaction.type === 3 && custom === 'orbit_birthday_register') return { type: 9, data: { custom_id: 'orbit_birthday_modal', title: 'Register Birthday', components: [{ type: 18, label: 'Month', component: { type: 4, custom_id: 'month', style: 1, required: true, min_length: 1, max_length: 2, placeholder: '10' } }, { type: 18, label: 'Day', component: { type: 4, custom_id: 'day', style: 1, required: true, min_length: 1, max_length: 2, placeholder: '6' } }] } };
  if (interaction.type === 3 && custom === 'orbit_birthday_remove') { await env.DB.prepare('DELETE FROM birthday_entries WHERE guild_id=? AND user_id=?').bind(guildId, userId).run(); return ephemeral('Your birthday registration was removed.'); }
  if (interaction.type === 5 && custom === 'orbit_birthday_modal') {
    const values = modalValues(interaction.data?.components), month = Number(values.month), day = Number(values.day);
    if (!validBirthday(month, day)) return ephemeral('Please enter a real month and day, such as 10 and 6.');
    const now = Date.now();
    await env.DB.prepare(`INSERT INTO birthday_entries(guild_id,user_id,month,day,enabled,created_at,updated_at) VALUES(?,?,?,?,1,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET month=excluded.month,day=excluded.day,enabled=1,updated_at=excluded.updated_at`).bind(guildId, userId, month, day, now, now).run();
    return ephemeral(`Your birthday is registered for ${month}/${day}. Orbit will announce it once per year in the configured channel.`);
  }
  return null;
}
function modalValues(components: any): Record<string, string> { const values: Record<string, string> = {}; const visit = (x: any) => { if (!x || typeof x !== 'object') return; if (x.custom_id && x.value !== undefined) values[String(x.custom_id)] = String(x.value); if (x.component) visit(x.component); if (Array.isArray(x.components)) x.components.forEach(visit); }; (Array.isArray(components) ? components : []).forEach(visit); return values; }
function validBirthday(month: number, day: number): boolean { if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) return false; const date = new Date(2024, month - 1, day); return date.getFullYear() === 2024 && date.getMonth() === month - 1 && date.getDate() === day; }
function ephemeral(content: string) { return { type: 4, data: { content, flags: 64 } }; }
