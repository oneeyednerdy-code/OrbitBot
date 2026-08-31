import type { Env } from '../../types';
import { managedGuild } from '../../auth/authorization';
import { getSession } from '../../auth/session';
import { json, redirect } from '../../http/responses';
import { randomToken, seal, sha256 } from '../../security/crypto';

const validPlatforms = new Set(['twitch','youtube']);

export async function connectionOauthStart(request: Request, env: Env, platform: string): Promise<Response> {
  if (!validPlatforms.has(platform)) return json({ error: 'unsupported_platform' }, 404);
  const session = await getSession(request, env);
  if (!session) return redirect('/oauth/login');
  const guildId = new URL(request.url).searchParams.get('guild_id');
  if (!guildId || !/^\d+$/.test(guildId)) return json({ error: 'guild_required' }, 400);
  const authz = await managedGuild(request, env, guildId);
  if (!authz) return json({ error: 'forbidden' }, 403);
  if (!env.SOCIAL_CREDENTIAL_KEY) return json({ error: 'social_credential_key_missing' }, 503);

  const state = randomToken();
  const now = Date.now();
  await env.DB.prepare('DELETE FROM connection_oauth_states WHERE expires_at<=?').bind(now).run();
  await env.DB.prepare('INSERT INTO connection_oauth_states(state_hash,guild_id,user_id,platform,expires_at,created_at) VALUES(?,?,?,?,?,?)')
    .bind(await sha256(state), guildId, session.user_id, platform, now + 10 * 60_000, now).run();

  if (platform === 'twitch') {
    if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return json({ error: 'twitch_oauth_not_configured' }, 503);
    const url = new URL('https://id.twitch.tv/oauth2/authorize');
    url.searchParams.set('client_id', env.TWITCH_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${env.APP_ORIGIN}/connections/twitch/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'user:read:email');
    url.searchParams.set('state', state);
    return redirect(url.toString());
  }

  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) return json({ error: 'youtube_oauth_not_configured' }, 503);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.YOUTUBE_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${env.APP_ORIGIN}/connections/youtube/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/youtube.readonly');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return redirect(url.toString());
}

export async function connectionOauthCallback(request: Request, env: Env, platform: string): Promise<Response> {
  if (!validPlatforms.has(platform)) return json({ error: 'unsupported_platform' }, 404);
  const session = await getSession(request, env);
  if (!session) return redirect('/oauth/login');
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return redirect(`/?connection_error=oauth_cancelled#connections`);
  const stateHash = await sha256(state);
  const row = await env.DB.prepare(`SELECT state_hash,guild_id,user_id,platform FROM connection_oauth_states
    WHERE state_hash=? AND expires_at>?`).bind(stateHash, Date.now()).first<any>();
  if (!row || row.user_id !== session.user_id || row.platform !== platform) return json({ error: 'invalid_oauth_state' }, 400);
  const authz = await managedGuild(request, env, row.guild_id);
  if (!authz) return json({ error: 'forbidden' }, 403);
  await env.DB.prepare('DELETE FROM connection_oauth_states WHERE state_hash=?').bind(stateHash).run();
  if (!env.SOCIAL_CREDENTIAL_KEY) return json({ error: 'social_credential_key_missing' }, 503);

  try {
    const result = platform === 'twitch' ? await exchangeTwitch(code, env) : await exchangeYoutube(code, env);
    const cipher = await seal(JSON.stringify(result.token), env.SOCIAL_CREDENTIAL_KEY);
    const now = Date.now();
    await env.DB.prepare(`INSERT INTO creator_account_connections(guild_id,platform,account_id,account_label,credential_ciphertext,scopes_json,status,expires_at,connected_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?, 'connected', ?,?,?,?)
      ON CONFLICT(guild_id,platform,account_id) DO UPDATE SET account_label=excluded.account_label,credential_ciphertext=excluded.credential_ciphertext,scopes_json=excluded.scopes_json,status='connected',expires_at=excluded.expires_at,connected_by=excluded.connected_by,updated_at=excluded.updated_at`)
      .bind(row.guild_id, platform, result.accountId, result.accountLabel, cipher, JSON.stringify(result.scopes), result.expiresAt, session.user_id, now, now).run();
    return redirect(`/?guild=${encodeURIComponent(row.guild_id)}&connected=${platform}#connections`);
  } catch (error) {
    console.error('connection oauth callback failed', platform, error);
    return redirect(`/?guild=${encodeURIComponent(row.guild_id)}&connection_error=${platform}#connections`);
  }
}

async function exchangeTwitch(code: string, env: Env) {
  const body = new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID!, client_secret: env.TWITCH_CLIENT_SECRET!, code, grant_type: 'authorization_code', redirect_uri: `${env.APP_ORIGIN}/connections/twitch/callback` });
  const response = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: {'content-type':'application/x-www-form-urlencoded'}, body });
  if (!response.ok) throw new Error('twitch_exchange_failed');
  const token = await response.json<any>();
  const userResponse = await fetch('https://api.twitch.tv/helix/users', { headers: { Authorization: `Bearer ${token.access_token}`, 'Client-Id': env.TWITCH_CLIENT_ID! } });
  if (!userResponse.ok) throw new Error('twitch_user_failed');
  const user = (await userResponse.json<any>()).data?.[0];
  if (!user?.id) throw new Error('twitch_user_missing');
  return { accountId: user.id, accountLabel: user.display_name || user.login || user.id, token, scopes: token.scope || [], expiresAt: Date.now() + Number(token.expires_in || 0) * 1000 };
}

async function exchangeYoutube(code: string, env: Env) {
  const body = new URLSearchParams({ client_id: env.YOUTUBE_CLIENT_ID!, client_secret: env.YOUTUBE_CLIENT_SECRET!, code, grant_type: 'authorization_code', redirect_uri: `${env.APP_ORIGIN}/connections/youtube/callback` });
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: {'content-type':'application/x-www-form-urlencoded'}, body });
  if (!response.ok) throw new Error('youtube_exchange_failed');
  const token = await response.json<any>();
  const channelResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!channelResponse.ok) throw new Error('youtube_channel_failed');
  const channel = (await channelResponse.json<any>()).items?.[0];
  if (!channel?.id) throw new Error('youtube_channel_missing');
  return { accountId: channel.id, accountLabel: channel.snippet?.title || channel.id, token, scopes: String(token.scope || '').split(' ').filter(Boolean), expiresAt: Date.now() + Number(token.expires_in || 0) * 1000 };
}
