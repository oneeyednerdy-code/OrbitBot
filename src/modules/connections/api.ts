import type { Env } from '../../types';
import { json } from '../../http/responses';
import { seal } from '../../security/crypto';
import { fetchWithTimeout } from '../../http/fetch-timeout';
import { loadGuildResources, validateChannelIds } from '../../discord/guild-resources';

export async function connectionsApi(request: Request, env: Env, guildId: string, actorId: string): Promise<Response> {
  if (request.method === 'GET') {
    const [rows, tiktokAnnouncements] = await Promise.all([
      env.DB.prepare(`SELECT id,platform,account_id,account_label,account_login,status,expires_at,created_at,updated_at
        FROM creator_account_connections WHERE guild_id=? ORDER BY platform,account_label`).bind(guildId).all(),
      env.DB.prepare(`SELECT c.id,c.connection_id,c.discord_channel_id,c.message_template,c.enabled,c.poll_interval_minutes,c.last_checked_at,c.last_error,c.updated_at,
          a.account_id,a.account_label,a.status
        FROM tiktok_announce_configs c JOIN creator_account_connections a ON a.id=c.connection_id
        WHERE c.guild_id=? ORDER BY c.updated_at DESC`).bind(guildId).all(),
    ]);
    return json({
      connections: rows.results,
      tiktok_announcements: tiktokAnnouncements.results,
      availability: {
        twitch: Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET && env.SOCIAL_CREDENTIAL_KEY),
        youtube: Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET && env.SOCIAL_CREDENTIAL_KEY),
        threads: Boolean(env.THREADS_CLIENT_ID && env.THREADS_CLIENT_SECRET && env.SOCIAL_CREDENTIAL_KEY),
        bluesky: Boolean(env.SOCIAL_CREDENTIAL_KEY),
        mastodon: Boolean(env.SOCIAL_CREDENTIAL_KEY),
        tiktok: Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET && env.SOCIAL_CREDENTIAL_KEY),
        instagram: Boolean(env.INSTAGRAM_CLIENT_ID && env.INSTAGRAM_CLIENT_SECRET && env.SOCIAL_CREDENTIAL_KEY),
      }
    });
  }

  if (request.method === 'POST') {
    const body = await request.json<any>();
    if (body.op === 'save_tiktok_announce') {
      const connectionId = Number(body.connection_id);
      const channelId = String(body.discord_channel_id || '');
      if (!Number.isInteger(connectionId) || !channelId) return json({ error: 'tiktok_announcement_fields_required' }, 400);
      const connection = await env.DB.prepare(`SELECT id FROM creator_account_connections
        WHERE id=? AND guild_id=? AND platform='tiktok' AND status='connected'`).bind(connectionId, guildId).first<any>();
      if (!connection) return json({ error: 'tiktok_connection_not_found' }, 404);
      const resources = await loadGuildResources(env, guildId, { channels: true });
      if (!resources.ok) return json(resources, resources.status);
      const invalidChannel = validateChannelIds(resources, [channelId]);
      if (invalidChannel) return json(invalidChannel, invalidChannel.status);
      const template = String(body.message_template || '').trim();
      if (!template || template.length > 2000) return json({ error: 'invalid_tiktok_message_template' }, 400);
      const interval = Math.min(60, Math.max(5, Number(body.poll_interval_minutes || 10)));
      const now = Date.now();
      await env.DB.prepare(`INSERT INTO tiktok_announce_configs(guild_id,connection_id,discord_channel_id,message_template,enabled,poll_interval_minutes,last_checked_at,last_error,created_at,updated_at)
        VALUES(?,?,?,?,1,?,?,NULL,?,?)
        ON CONFLICT(guild_id,connection_id) DO UPDATE SET discord_channel_id=excluded.discord_channel_id,message_template=excluded.message_template,enabled=excluded.enabled,poll_interval_minutes=excluded.poll_interval_minutes,updated_at=excluded.updated_at`)
        .bind(guildId, connectionId, channelId, template, interval, null, now, now).run();
      return json({ ok: true });
    }
    if (body.op !== 'connect_bluesky') return json({ error: 'unsupported_connection_operation' }, 400);
    if (!env.SOCIAL_CREDENTIAL_KEY) return json({ error: 'social_credential_key_missing' }, 503);
    const identifier = String(body.identifier || '').trim();
    const appPassword = String(body.app_password || '').trim();
    if (!identifier || !appPassword) return json({ error: 'bluesky_credentials_required' }, 400);

    const auth = await fetchWithTimeout('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password: appPassword }),
    });
    let payload: any = {};
    try { payload = await auth.json<any>(); } catch {}
    if (!auth.ok || !payload?.did) return json({ error: 'bluesky_auth_failed', status: auth.status, detail: payload?.message || payload?.error || 'Bluesky rejected the login.' }, 400);

    const credentials = { identifier: payload.handle || identifier, app_password: appPassword };
    const cipher = await seal(JSON.stringify(credentials), env.SOCIAL_CREDENTIAL_KEY);
    const now = Date.now();
    await env.DB.prepare(`INSERT INTO creator_account_connections(guild_id,platform,account_id,account_label,credential_ciphertext,scopes_json,status,expires_at,connected_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'connected',NULL,?,?,?)
      ON CONFLICT(guild_id,platform,account_id) DO UPDATE SET account_label=excluded.account_label,credential_ciphertext=excluded.credential_ciphertext,status='connected',connected_by=excluded.connected_by,updated_at=excluded.updated_at`)
      .bind(guildId, 'bluesky', String(payload.did), String(payload.handle || identifier), cipher, JSON.stringify(['atproto']), actorId, now, now).run();
    await upsertSocialIntegration(env, guildId, 'bluesky', String(payload.handle || identifier), cipher, now);
    return json({ ok: true, platform: 'bluesky', account_label: payload.handle || identifier });
  }

  if (request.method === 'DELETE') {
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isFinite(id)) return json({ error: 'invalid_connection' }, 400);
    const row = await env.DB.prepare('SELECT platform,account_label FROM creator_account_connections WHERE id=? AND guild_id=?').bind(id, guildId).first<any>();
    if (!row) return json({ error: 'connection_not_found' }, 404);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM creator_account_connections WHERE id=? AND guild_id=?').bind(id, guildId),
      env.DB.prepare('DELETE FROM social_integrations WHERE guild_id=? AND platform=? AND account_label=?').bind(guildId, row.platform, row.account_label),
      env.DB.prepare('DELETE FROM tiktok_announce_configs WHERE connection_id=? AND guild_id=?').bind(id, guildId),
      env.DB.prepare('DELETE FROM owner_stream_alert_configs WHERE connection_id=?').bind(id),
    ]);
    return json({ ok: true });
  }
  return json({ error: 'method_not_allowed' }, 405);
}

export async function upsertSocialIntegration(env: Env, guildId: string, platform: string, accountLabel: string, cipher: string, now = Date.now()) {
  if (!['threads','bluesky','mastodon'].includes(platform)) return;
  await env.DB.prepare(`INSERT INTO social_integrations(guild_id,platform,account_label,credential_ref,discord_channel_id,settings_json,enabled,created_at,updated_at,credential_ciphertext,status)
    VALUES(?,?,?,?,?,?,1,?,?,?,'connected')
    ON CONFLICT(guild_id,platform,account_label) DO UPDATE SET credential_ciphertext=excluded.credential_ciphertext,enabled=1,updated_at=excluded.updated_at,status='connected'`)
    .bind(guildId, platform, accountLabel, null, null, '{}', now, now, cipher).run();
}
