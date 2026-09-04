import type { Env } from '../../types';
import { json } from '../../http/responses';
import { seal } from '../../security/crypto';
import { fetchWithTimeout } from '../../http/fetch-timeout';

export async function connectionsApi(request: Request, env: Env, guildId: string, actorId: string): Promise<Response> {
  if (request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT id,platform,account_id,account_label,status,expires_at,created_at,updated_at
      FROM creator_account_connections WHERE guild_id=? ORDER BY platform,account_label`).bind(guildId).all();
    return json({
      connections: rows.results,
      availability: {
        twitch: Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET && env.SOCIAL_CREDENTIAL_KEY),
        youtube: Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET && env.SOCIAL_CREDENTIAL_KEY),
        threads: Boolean(env.THREADS_CLIENT_ID && env.THREADS_CLIENT_SECRET && env.SOCIAL_CREDENTIAL_KEY),
        bluesky: Boolean(env.SOCIAL_CREDENTIAL_KEY),
        mastodon: Boolean(env.SOCIAL_CREDENTIAL_KEY),
      }
    });
  }

  if (request.method === 'POST') {
    const body = await request.json<any>();
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
