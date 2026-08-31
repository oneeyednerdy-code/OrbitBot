import type { Env } from '../types';
import { discord } from '../discord/client';
import { ORBIT_INSTALL_PERMISSIONS } from '../discord/permissions';
import { json, redirect } from '../http/responses';
import { randomToken, seal, sha256 } from '../security/crypto';

export async function oauthStart(env: Env): Promise<Response> {
  const state = randomToken();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO oauth_states(state_hash,expires_at,created_at) VALUES(?,?,?)')
    .bind(await sha256(state), now + 10 * 60_000, now).run();
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', env.DISCORD_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', `${env.APP_ORIGIN}/oauth/callback`);
  url.searchParams.set('scope', 'identify guilds');
  url.searchParams.set('state', state);
  return redirect(url.toString());
}

export function installUrl(env: Env, guildId?: string | null): string {
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', env.DISCORD_CLIENT_ID);
  url.searchParams.set('scope', 'bot applications.commands');
  url.searchParams.set('permissions', ORBIT_INSTALL_PERMISSIONS);
  if (guildId) url.searchParams.set('guild_id', guildId);
  url.searchParams.set('disable_guild_select', 'false');
  return url.toString();
}

export function installRedirect(env: Env, guildId?: string | null): Response { return redirect(installUrl(env, guildId)); }

export async function oauthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return json({ error: 'invalid_oauth_request' }, 400);
  const stateHash = await sha256(state);
  const stateRow = await env.DB.prepare('SELECT state_hash FROM oauth_states WHERE state_hash=? AND expires_at>?').bind(stateHash, Date.now()).first();
  if (!stateRow) return json({ error: 'invalid_oauth_state' }, 400);
  await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash=?').bind(stateHash).run();

  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: `${env.APP_ORIGIN}/oauth/callback`,
  });
  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!tokenResponse.ok) return json({ error: 'oauth_exchange_failed' }, 502);
  const token = (await tokenResponse.json()) as any;
  const userResponse = await discord(env, '/users/@me', {}, token.access_token);
  if (!userResponse.ok) return json({ error: 'oauth_user_failed' }, 502);
  const user = (await userResponse.json()) as any;
  const id = randomToken();
  const csrf = randomToken();
  const encryptedToken = await seal(token.access_token, env.SESSION_SECRET);
  await env.DB.prepare('INSERT INTO sessions(id,user_id,username,avatar,access_token,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(id, user.id, user.username, user.avatar, encryptedToken, csrf, Date.now() + token.expires_in * 1000, Date.now()).run();
  return redirect('/', { 'set-cookie': `orby_session=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.min(token.expires_in, 604800)}` });
}
