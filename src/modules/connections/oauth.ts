import type { Env } from '../../types';
import { managedGuild } from '../../auth/authorization';
import { getSession } from '../../auth/session';
import { json, redirect } from '../../http/responses';
import { randomToken, seal, sha256, openSeal } from '../../security/crypto';
import { upsertSocialIntegration } from './api';
import { recordSystemError } from '../../repositories/errors';
import { publicHttpsUrl } from '../../security/outbound-url';
import { fetchWithTimeout } from '../../http/fetch-timeout';

const validPlatforms = new Set(['twitch','youtube','threads','mastodon','tiktok','instagram']);

export async function connectionOauthStart(request: Request, env: Env, platform: string): Promise<Response> {
  if (!validPlatforms.has(platform)) return json({ error: 'unsupported_platform' }, 404);
  const session = await getSession(request, env);
  if (!session) return redirect('/oauth/login');
  const requestUrl = new URL(request.url);
  const guildId = requestUrl.searchParams.get('guild_id');
  if (!guildId || !/^\d+$/.test(guildId)) return json({ error: 'guild_required' }, 400);
  const authz = await managedGuild(request, env, guildId, session);
  if (!authz.ok) return json({ error: authz.error, detail: authz.detail, retry_after: authz.retry_after }, authz.status);
  const purpose=requestUrl.searchParams.get('purpose');
  if(purpose&&!(platform==='twitch'&&purpose==='owner_stream'))return json({error:'invalid_connection_purpose'},400);
  if(purpose==='owner_stream'&&authz.guild?.owner!==true)return json({error:'owner_only',detail:'Only the Discord server owner can connect Twitch for My Stream alerts.'},403);
  if (!env.SOCIAL_CREDENTIAL_KEY) return json({ error: 'social_credential_key_missing' }, 503);

  const state = randomToken();
  const now = Date.now();
  await env.DB.prepare('DELETE FROM connection_oauth_states WHERE expires_at<=?').bind(now).run();

  if (platform === 'twitch') {
    if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return json({ error: 'twitch_oauth_not_configured' }, 503);
    await saveState(env, state, guildId, session.user_id, platform, now, purpose==='owner_stream'?JSON.stringify({purpose:'owner_stream'}):null);
    const url = new URL('https://id.twitch.tv/oauth2/authorize');
    url.searchParams.set('client_id', env.TWITCH_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${env.APP_ORIGIN}/connections/twitch/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'user:read:email');
    url.searchParams.set('state', state);
    return redirect(url.toString());
  }

  if (platform === 'youtube') {
    if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) return json({ error: 'youtube_oauth_not_configured' }, 503);
    await saveState(env, state, guildId, session.user_id, platform, now, null);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env.YOUTUBE_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${env.APP_ORIGIN}/connections/youtube/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);
    return redirect(url.toString());
  }

  if (platform === 'threads') {
    if (!env.THREADS_CLIENT_ID || !env.THREADS_CLIENT_SECRET) return json({ error: 'threads_oauth_not_configured' }, 503);
    await saveState(env, state, guildId, session.user_id, platform, now, null);
    const url = new URL('https://threads.net/oauth/authorize');
    url.searchParams.set('client_id', env.THREADS_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${env.APP_ORIGIN}/connections/threads/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'threads_basic,threads_content_publish');
    url.searchParams.set('state', state);
    return redirect(url.toString());
  }

  if (platform === 'tiktok') {
    if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) return json({ error: 'tiktok_oauth_not_configured' }, 503);
    await saveState(env, state, guildId, session.user_id, platform, now, null);
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
    url.searchParams.set('client_key', env.TIKTOK_CLIENT_KEY);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'user.info.basic,video.list,video.publish');
    url.searchParams.set('redirect_uri', `${env.APP_ORIGIN}/connections/tiktok/callback`);
    url.searchParams.set('state', state);
    return redirect(url.toString());
  }

  if (platform === 'instagram') {
    if (!env.INSTAGRAM_CLIENT_ID || !env.INSTAGRAM_CLIENT_SECRET) return json({ error: 'instagram_oauth_not_configured' }, 503);
    await saveState(env, state, guildId, session.user_id, platform, now, null);
    const url = new URL('https://www.instagram.com/oauth/authorize');
    url.searchParams.set('client_id', env.INSTAGRAM_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${env.APP_ORIGIN}/connections/instagram/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'instagram_business_basic,instagram_business_content_publish');
    url.searchParams.set('state', state);
    return redirect(url.toString());
  }

  const instance = normalizeInstance(requestUrl.searchParams.get('instance'));
  if (!instance) return json({ error: 'mastodon_instance_required' }, 400);
  const redirectUri = `${env.APP_ORIGIN}/connections/mastodon/callback`;
  const registration = await fetchWithTimeout(`${instance}/api/v1/apps`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_name: 'Nerdspace Orbit', redirect_uris: redirectUri, scopes: 'read:accounts write:statuses', website: env.APP_ORIGIN }),
  });
  let app: any = {};
  try { app = await registration.json<any>(); } catch {}
  if (!registration.ok || !app.client_id || !app.client_secret) { const requestId=await recordSystemError(env,guildId,'/api/v1/apps','POST',registration.status,'mastodon_app_registration_failed',{instance,detail:app?.error||app?.error_description}); return json({ error: 'mastodon_app_registration_failed', status: registration.status, detail: app?.error || app?.error_description || 'The instance rejected app registration.', request_id:requestId }, 400); }
  const context = await seal(JSON.stringify({ instance, client_id: app.client_id, client_secret: app.client_secret }), env.SOCIAL_CREDENTIAL_KEY);
  await saveState(env, state, guildId, session.user_id, platform, now, context);
  const url = new URL(`${instance}/oauth/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', app.client_id);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'read:accounts write:statuses');
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
  const providerError = url.searchParams.get('error');
  if (!code || !state) return redirect(`/?connection_error=${encodeURIComponent(providerError || 'oauth_cancelled')}#connections`);
  const stateHash = await sha256(state);
  const row = await env.DB.prepare(`SELECT state_hash,guild_id,user_id,platform,context_json FROM connection_oauth_states
    WHERE state_hash=? AND expires_at>?`).bind(stateHash, Date.now()).first<any>();
  if (!row || row.user_id !== session.user_id || row.platform !== platform) return json({ error: 'invalid_oauth_state' }, 400);
  const authz = await managedGuild(request, env, row.guild_id, session);
  if (!authz.ok) return json({ error: authz.error, detail: authz.detail, retry_after: authz.retry_after }, authz.status);
  let flowContext:any={};try{flowContext=row.context_json?JSON.parse(row.context_json):{};}catch{}
  const ownerStream=platform==='twitch'&&flowContext?.purpose==='owner_stream';
  if(ownerStream&&authz.guild?.owner!==true)return json({error:'owner_only',detail:'Only the Discord server owner can connect Twitch for My Stream alerts.'},403);
  await env.DB.prepare('DELETE FROM connection_oauth_states WHERE state_hash=?').bind(stateHash).run();
  if (!env.SOCIAL_CREDENTIAL_KEY) return json({ error: 'social_credential_key_missing' }, 503);

  try {
    let result: any;
    if (platform === 'twitch') result = await exchangeTwitch(code, env);
    else if (platform === 'youtube') result = await exchangeYoutube(code, env);
    else if (platform === 'threads') result = await exchangeThreads(code, env);
    else if (platform === 'tiktok') result = await exchangeTikTok(code, env);
    else if (platform === 'instagram') result = await exchangeInstagram(code, env);
    else result = await exchangeMastodon(code, row.context_json, env);

    const cipher = await seal(JSON.stringify(result.credentials || result.token), env.SOCIAL_CREDENTIAL_KEY);
    const now = Date.now();
    await env.DB.prepare(`INSERT INTO creator_account_connections(guild_id,platform,account_id,account_label,account_login,credential_ciphertext,scopes_json,status,expires_at,connected_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,'connected',?,?,?,?)
      ON CONFLICT(guild_id,platform,account_id) DO UPDATE SET account_label=excluded.account_label,account_login=excluded.account_login,credential_ciphertext=excluded.credential_ciphertext,scopes_json=excluded.scopes_json,status='connected',expires_at=excluded.expires_at,connected_by=excluded.connected_by,updated_at=excluded.updated_at`)
      .bind(row.guild_id, platform, result.accountId, result.accountLabel, result.accountLogin||null, cipher, JSON.stringify(result.scopes), result.expiresAt, session.user_id, now, now).run();
    await upsertSocialIntegration(env, row.guild_id, platform, result.accountLabel, cipher, now);
    return redirect(`/?guild=${encodeURIComponent(row.guild_id)}&connected=${platform}#${ownerStream?'creator':'connections'}`);
  } catch (error: any) {
    const requestId = await recordSystemError(env, row.guild_id, `/connections/${platform}/callback`, 'GET', 502, `${platform}_oauth_callback_failed`, { name:error?.name, message:error?.message });
    console.error('connection oauth callback failed', platform, requestId, error);
    return redirect(`/?guild=${encodeURIComponent(row.guild_id)}&connection_error=${encodeURIComponent(`${error?.message || platform} (${requestId})`)}#connections`);
  }
}

async function saveState(env: Env, state: string, guildId: string, userId: string, platform: string, now: number, context: string | null) {
  await env.DB.prepare('INSERT INTO connection_oauth_states(state_hash,guild_id,user_id,platform,expires_at,created_at,context_json) VALUES(?,?,?,?,?,?,?)')
    .bind(await sha256(state), guildId, userId, platform, now + 10 * 60_000, now, context).run();
}

async function exchangeTwitch(code: string, env: Env) {
  const body = new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID!, client_secret: env.TWITCH_CLIENT_SECRET!, code, grant_type: 'authorization_code', redirect_uri: `${env.APP_ORIGIN}/connections/twitch/callback` });
  const response = await fetchWithTimeout('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: {'content-type':'application/x-www-form-urlencoded'}, body });
  if (!response.ok) throw new Error(`twitch_exchange_failed_${response.status}`);
  const token = await response.json<any>();
  const userResponse = await fetchWithTimeout('https://api.twitch.tv/helix/users', { headers: { Authorization: `Bearer ${token.access_token}`, 'Client-Id': env.TWITCH_CLIENT_ID! } });
  if (!userResponse.ok) throw new Error(`twitch_user_failed_${userResponse.status}`);
  const user = (await userResponse.json<any>()).data?.[0];
  if (!user?.id) throw new Error('twitch_user_missing');
  return { accountId: user.id, accountLabel: user.display_name || user.login || user.id, accountLogin: user.login || null, credentials: { ...token, login: user.login || null, display_name: user.display_name || null }, token, scopes: token.scope || [], expiresAt: Date.now() + Number(token.expires_in || 0) * 1000 };
}

async function exchangeYoutube(code: string, env: Env) {
  const body = new URLSearchParams({ client_id: env.YOUTUBE_CLIENT_ID!, client_secret: env.YOUTUBE_CLIENT_SECRET!, code, grant_type: 'authorization_code', redirect_uri: `${env.APP_ORIGIN}/connections/youtube/callback` });
  const response = await fetchWithTimeout('https://oauth2.googleapis.com/token', { method: 'POST', headers: {'content-type':'application/x-www-form-urlencoded'}, body });
  if (!response.ok) throw new Error(`youtube_exchange_failed_${response.status}`);
  const token = await response.json<any>();
  const channelResponse = await fetchWithTimeout('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!channelResponse.ok) throw new Error(`youtube_channel_failed_${channelResponse.status}`);
  const channel = (await channelResponse.json<any>()).items?.[0];
  if (!channel?.id) throw new Error('youtube_channel_missing');
  return { accountId: channel.id, accountLabel: channel.snippet?.title || channel.id, token, scopes: String(token.scope || '').split(' ').filter(Boolean), expiresAt: Date.now() + Number(token.expires_in || 0) * 1000 };
}

async function exchangeThreads(code: string, env: Env) {
  if (!env.THREADS_CLIENT_ID || !env.THREADS_CLIENT_SECRET) throw new Error('threads_oauth_not_configured');
  const body = new URLSearchParams({ client_id: env.THREADS_CLIENT_ID, client_secret: env.THREADS_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: `${env.APP_ORIGIN}/connections/threads/callback` });
  const response = await fetchWithTimeout('https://graph.threads.net/oauth/access_token', { method: 'POST', headers: {'content-type':'application/x-www-form-urlencoded'}, body });
  if (!response.ok) throw new Error(`threads_exchange_failed_${response.status}`);
  let token = await response.json<any>();
  if (!token?.access_token) throw new Error('threads_token_missing');
  try {
    const longUrl = new URL('https://graph.threads.net/access_token');
    longUrl.searchParams.set('grant_type', 'th_exchange_token');
    longUrl.searchParams.set('client_secret', env.THREADS_CLIENT_SECRET);
    longUrl.searchParams.set('access_token', token.access_token);
    const long = await fetchWithTimeout(longUrl);
    if (long.ok) token = { ...token, ...(await long.json<any>()) };
  } catch {}
  const meUrl = new URL('https://graph.threads.net/v1.0/me');
  meUrl.searchParams.set('fields', 'id,username');
  meUrl.searchParams.set('access_token', token.access_token);
  const me = await fetchWithTimeout(meUrl);
  if (!me.ok) throw new Error(`threads_profile_failed_${me.status}`);
  const account = await me.json<any>();
  if (!account?.id) throw new Error('threads_user_missing');
  return { accountId: String(account.id), accountLabel: account.username || String(account.id), credentials: { user_id: String(account.id), access_token: token.access_token }, scopes: ['threads_basic','threads_content_publish'], expiresAt: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : null };
}

async function exchangeTikTok(code: string, env: Env) {
  if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) throw new Error('tiktok_oauth_not_configured');
  const redirectUri = `${env.APP_ORIGIN}/connections/tiktok/callback`;
  const response = await fetchWithTimeout('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: redirectUri }),
  });
  const payload = await response.json<any>().catch(() => ({}));
  const token = payload?.data;
  if (!response.ok || payload?.error?.code && payload.error.code !== 'ok') throw new Error(`tiktok_exchange_failed_${response.status}`);
  if (!token?.access_token || !token?.open_id) throw new Error('tiktok_token_missing');
  const profileUrl = new URL('https://open.tiktokapis.com/v2/user/info/');
  profileUrl.searchParams.set('fields', 'open_id,display_name');
  const profileResponse = await fetchWithTimeout(profileUrl, { headers: { authorization: `Bearer ${token.access_token}` } });
  const profilePayload = await profileResponse.json<any>().catch(() => ({}));
  const profile = profilePayload?.data?.user;
  if (!profileResponse.ok || !profile?.open_id) throw new Error(`tiktok_profile_failed_${profileResponse.status}`);
  return {
    accountId: String(profile.open_id),
    accountLabel: String(profile.display_name || profile.open_id),
    credentials: { access_token: token.access_token, refresh_token: token.refresh_token, open_id: String(token.open_id), scope: token.scope || '', refresh_expires_in: token.refresh_expires_in || null },
    scopes: String(token.scope || '').split(/[ ,]+/).filter(Boolean),
    expiresAt: Date.now() + Number(token.expires_in || 0) * 1000,
  };
}

async function exchangeInstagram(code: string, env: Env) {
  if (!env.INSTAGRAM_CLIENT_ID || !env.INSTAGRAM_CLIENT_SECRET) throw new Error('instagram_oauth_not_configured');
  const redirectUri = `${env.APP_ORIGIN}/connections/instagram/callback`;
  const response = await fetchWithTimeout('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.INSTAGRAM_CLIENT_ID, client_secret: env.INSTAGRAM_CLIENT_SECRET, grant_type: 'authorization_code', redirect_uri: redirectUri, code }),
  });
  const token = await response.json<any>().catch(() => ({}));
  if (!response.ok || !token?.access_token || !token?.user_id) throw new Error(`instagram_exchange_failed_${response.status}`);
  const profileUrl = new URL('https://graph.instagram.com/me');
  profileUrl.searchParams.set('fields', 'user_id,username');
  profileUrl.searchParams.set('access_token', token.access_token);
  const profileResponse = await fetchWithTimeout(profileUrl);
  const profile = await profileResponse.json<any>().catch(() => ({}));
  if (!profileResponse.ok) throw new Error(`instagram_profile_failed_${profileResponse.status}`);
  let longLived = token;
  try {
    const longUrl = new URL('https://graph.instagram.com/access_token');
    longUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longUrl.searchParams.set('client_secret', env.INSTAGRAM_CLIENT_SECRET);
    longUrl.searchParams.set('access_token', token.access_token);
    const longResponse = await fetchWithTimeout(longUrl);
    if (longResponse.ok) longLived = { ...token, ...(await longResponse.json<any>()) };
  } catch {}
  return {
    accountId: String(profile.user_id || token.user_id),
    accountLabel: String(profile.username || profile.user_id || token.user_id),
    credentials: { access_token: longLived.access_token, user_id: String(profile.user_id || token.user_id), username: profile.username || null },
    scopes: ['instagram_business_basic', 'instagram_business_content_publish'],
    expiresAt: longLived.expires_in ? Date.now() + Number(longLived.expires_in) * 1000 : null,
  };
}

async function exchangeMastodon(code: string, contextCipher: string | null, env: Env) {
  if (!contextCipher || !env.SOCIAL_CREDENTIAL_KEY) throw new Error('mastodon_oauth_context_missing');
  const context = JSON.parse(await openSeal(contextCipher, env.SOCIAL_CREDENTIAL_KEY));
  const instance = normalizeInstance(context.instance);
  if (!instance || !context.client_id || !context.client_secret) throw new Error('mastodon_oauth_context_invalid');
  const redirectUri = `${env.APP_ORIGIN}/connections/mastodon/callback`;
  const response = await fetchWithTimeout(`${instance}/oauth/token`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: context.client_id, client_secret: context.client_secret, redirect_uri: redirectUri, scope: 'read:accounts write:statuses' }),
  });
  if (!response.ok) throw new Error(`mastodon_exchange_failed_${response.status}`);
  const token = await response.json<any>();
  if (!token?.access_token) throw new Error('mastodon_token_missing');
  const me = await fetchWithTimeout(`${instance}/api/v1/accounts/verify_credentials`, { headers: { authorization: `Bearer ${token.access_token}` },redirect:'error' });
  if (!me.ok) throw new Error(`mastodon_profile_failed_${me.status}`);
  const account = await me.json<any>();
  if (!account?.id) throw new Error('mastodon_user_missing');
  const label = account.acct ? `@${account.acct}@${new URL(instance).host}` : String(account.id);
  return { accountId: `${new URL(instance).host}:${account.id}`, accountLabel: label, credentials: { instance, access_token: token.access_token }, scopes: String(token.scope || 'read:accounts write:statuses').split(' ').filter(Boolean), expiresAt: null };
}

function normalizeInstance(value: any): string | null {
  try {
    let raw = String(value || '').trim();
    if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    const url = publicHttpsUrl(raw);
    if (!url) return null;
    return `${url.protocol}//${url.host}`;
  } catch { return null; }
}
