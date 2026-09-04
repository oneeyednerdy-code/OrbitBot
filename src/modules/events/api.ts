import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { json } from '../../http/responses';
import { recordSystemError } from '../../repositories/errors';

export async function eventsApi(request: Request, env: Env, guildId: string, actorId: string): Promise<Response> {
  if (request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT e.*,
      (SELECT COUNT(*) FROM event_signups s WHERE s.event_id=e.id AND s.status='going') AS going_count,
      (SELECT COUNT(*) FROM event_signups s WHERE s.event_id=e.id AND s.status='maybe') AS maybe_count
      FROM community_events e WHERE e.guild_id=? ORDER BY e.starts_at ASC`).bind(guildId).all();
    return json({ events: rows.results });
  }

  if (request.method === 'POST') {
    const body = await request.json<any>();
    const startMs = Number(body.starts_at);
    const endMs = body.ends_at ? Number(body.ends_at) : startMs + 3600000;
    const repeat = normalizeRepeat(body.repeat);
    if (!body.name || !Number.isFinite(startMs)) return json({ error: 'name_and_start_required' }, 400);
    if (startMs <= Date.now() + 30_000) return json({ error: 'event_start_must_be_future', detail: 'Discord scheduled events need a future start time.' }, 400);
    if (!Number.isFinite(endMs) || endMs <= startMs) return json({ error: 'event_end_invalid', detail: 'End time must be after the start time.' }, 400);
    if (repeat && !body.create_discord_event) return json({ error: 'repeat_requires_discord_event', detail: 'Repeating events require Create Discord Scheduled Event to be enabled.' }, 400);

    const now = Date.now();
    const start = new Date(startMs).toISOString();
    const end = new Date(endMs).toISOString();
    const recurrenceRule = repeat ? discordRecurrence(repeat, start) : null;
    let discordEventId: string | null = null;

    if (body.create_discord_event) {
      const response = await discord(env, `/guilds/${guildId}/scheduled-events`, {
        method: 'POST',
        body: JSON.stringify({
          channel_id: null,
          name: String(body.name).slice(0, 100),
          description: String(body.description || '').slice(0, 1000) || undefined,
          privacy_level: 2,
          entity_type: 3,
          scheduled_start_time: start,
          scheduled_end_time: end,
          entity_metadata: { location: String(body.location || 'Discord').slice(0, 100) },
          recurrence_rule: recurrenceRule || undefined,
        }),
      });
      if (!response.ok) {
        const details = await discordFailure(response);
        const requestId = await recordSystemError(env, guildId, '/guilds/:guild/scheduled-events', 'POST', response.status, 'discord_event_failed', details);
        return json({ error: 'discord_event_failed', status: response.status, detail: details.message || 'Discord rejected the scheduled event.', discord_code: details.code || null, discord_errors: details.errors || null, request_id: requestId }, 400);
      }
      const created = await response.json<any>();
      discordEventId = created.id;
    }

    const result = await env.DB.prepare(`INSERT INTO community_events(guild_id,name,description,starts_at,ends_at,discord_channel_id,ping_role_id,signup_limit,discord_event_id,status,created_by,created_at,updated_at,recurrence_rule_json)
      VALUES(?,?,?,?,?,?,?,?,?,'scheduled',?,?,?,?)`)
      .bind(guildId, body.name, body.description || null, startMs, body.ends_at ? endMs : null, body.discord_channel_id || null, body.ping_role_id || null, Number(body.signup_limit) || null, discordEventId, actorId, now, now, recurrenceRule ? JSON.stringify({ preset: repeat, discord: recurrenceRule }) : null).run();
    const eventId = Number(result.meta.last_row_id);
    let rsvpPanelPosted = false;
    let rsvpPanelWarning: string | null = null;
    if (body.discord_channel_id && body.post_rsvp_panel !== false) {
      try {
        const response = await postRsvpPanel(env, guildId, eventId, body);
        if (!response.ok) rsvpPanelWarning = `Discord returned HTTP ${response.status} while posting the RSVP panel.`;
        else {
          const message = await response.json<any>();
          await env.DB.prepare('UPDATE community_events SET event_message_id=?,updated_at=? WHERE id=? AND guild_id=?').bind(String(message.id), Date.now(), eventId, guildId).run();
          rsvpPanelPosted = true;
        }
      } catch { rsvpPanelWarning = 'Orbit saved the event, but could not post its RSVP panel.'; }
    }
    return json({ ok: true, id: eventId, discord_event_id: discordEventId, rsvp_panel_posted: rsvpPanelPosted, warning: rsvpPanelWarning });
  }

  if (request.method === 'DELETE') {
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isFinite(id)) return json({ error: 'invalid_event_id' }, 400);
    const event = await env.DB.prepare('SELECT id,discord_event_id,event_message_id,discord_channel_id FROM community_events WHERE id=? AND guild_id=?').bind(id, guildId).first<any>();
    if (!event) return json({ error: 'event_not_found' }, 404);
    if (event.discord_event_id) {
      const response = await discord(env, `/guilds/${guildId}/scheduled-events/${event.discord_event_id}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        const details = await discordFailure(response);
        const requestId = await recordSystemError(env, guildId, '/guilds/:guild/scheduled-events/:event', 'DELETE', response.status, 'discord_event_delete_failed', details);
        return json({ error: 'discord_event_delete_failed', status: response.status, detail: details.message || 'Discord would not remove the scheduled event.', request_id: requestId }, 400);
      }
    }
    if (event.event_message_id && event.discord_channel_id) {
      const response = await discord(env, `/channels/${event.discord_channel_id}/messages/${event.event_message_id}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) await recordSystemError(env, guildId, '/channels/:channel/messages/:message', 'DELETE', response.status, 'event_rsvp_panel_delete_failed', { event_id: id });
    }
    await env.DB.prepare('DELETE FROM community_events WHERE id=? AND guild_id=?').bind(id, guildId).run();
    return json({ ok: true });
  }
  return json({ error: 'method_not_allowed' }, 405);
}

async function postRsvpPanel(env: Env, guildId: string, eventId: number, body: any): Promise<Response> {
  const roleId = String(body.ping_role_id || '');
  const mention = /^\d+$/.test(roleId) ? `<@&${roleId}> ` : '';
  return discord(env, `/channels/${String(body.discord_channel_id)}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: `${mention}**${String(body.name).slice(0, 100)}**\n${String(body.description || 'Join the community event!').slice(0, 1000)}\nStarts <t:${Math.floor(Number(body.starts_at) / 1000)}:F>`,
      allowed_mentions: roleId ? { parse: [], roles: [roleId] } : { parse: [] },
      components: [{ type: 1, components: [
        { type: 2, style: 3, label: 'I’m In', custom_id: `orbit_event_rsvp:${eventId}:going` },
        { type: 2, style: 2, label: 'Maybe', custom_id: `orbit_event_rsvp:${eventId}:maybe` },
        { type: 2, style: 4, label: 'Can’t Go', custom_id: `orbit_event_rsvp:${eventId}:declined` },
      ] }],
    }),
  });
}

function normalizeRepeat(value: unknown): 'daily'|'weekly'|'biweekly'|'monthly'|null {
  const repeat=String(value||'');
  return repeat==='daily'||repeat==='weekly'||repeat==='biweekly'||repeat==='monthly'?repeat:null;
}

function discordRecurrence(repeat:'daily'|'weekly'|'biweekly'|'monthly',start:string){
  if(repeat==='daily')return {start,frequency:3,interval:1};
  if(repeat==='weekly')return {start,frequency:2,interval:1};
  if(repeat==='biweekly')return {start,frequency:2,interval:2};
  return {start,frequency:1,interval:1};
}

async function discordFailure(response: Response): Promise<any> {
  try {
    const data = await response.json<any>();
    return { code: data?.code, message: data?.message, errors: data?.errors };
  } catch {
    return { message: `Discord returned HTTP ${response.status}.` };
  }
}
