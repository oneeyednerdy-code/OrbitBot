import type { Env } from '../../types';

export async function handleEventInteraction(env: Env, interaction: any): Promise<any | null> {
  if (interaction.type !== 3) return null;
  const match = String(interaction.data?.custom_id || '').match(/^orbit_event_rsvp:(\d+):(going|maybe|declined)$/);
  if (!match) return null;
  const eventId = Number(match[1]);
  const status = match[2] as 'going' | 'maybe' | 'declined';
  const guildId = String(interaction.guild_id || '');
  const userId = String(interaction.member?.user?.id || interaction.user?.id || '');
  if (!/^\d+$/.test(guildId) || !/^\d+$/.test(userId)) return ephemeral('Orbit could not identify this server member.');
  const event = await env.DB.prepare('SELECT id,name,signup_limit FROM community_events WHERE id=? AND guild_id=? AND status=\'scheduled\'').bind(eventId, guildId).first<any>();
  if (!event) return ephemeral('This event is no longer available.');
  if (status === 'going' && event.signup_limit) {
    const existing = await env.DB.prepare("SELECT status FROM event_signups WHERE event_id=? AND user_id=?").bind(eventId, userId).first<any>();
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM event_signups WHERE event_id=? AND status='going'").bind(eventId).first<any>();
    if (existing?.status !== 'going' && Number(count?.count || 0) >= Number(event.signup_limit)) return ephemeral(`“${event.name}” is full. Choose Maybe or wait for a spot to open.`);
  }
  await env.DB.prepare(`INSERT INTO event_signups(event_id,guild_id,user_id,status,created_at)
    VALUES(?,?,?,?,?) ON CONFLICT(event_id,user_id) DO UPDATE SET status=excluded.status,created_at=excluded.created_at`).bind(eventId, guildId, userId, status, Date.now()).run();
  const counts = await env.DB.prepare("SELECT status,COUNT(*) AS count FROM event_signups WHERE event_id=? GROUP BY status").bind(eventId).all<any>();
  const summary = Object.fromEntries(counts.results.map((row: any) => [row.status, Number(row.count || 0)]));
  const label = status === 'going' ? 'You’re in' : status === 'maybe' ? 'Marked maybe' : 'Marked as not attending';
  return ephemeral(`${label} for “${event.name}”. Going: ${summary.going || 0} · Maybe: ${summary.maybe || 0}.`);
}

function ephemeral(content: string) { return { type: 4, data: { content, flags: 64 } }; }
