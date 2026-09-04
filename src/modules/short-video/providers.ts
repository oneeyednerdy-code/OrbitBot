import type { Env } from '../../types';
import { fetchWithTimeout } from '../../http/fetch-timeout';
import { openSeal, seal } from '../../security/crypto';
import { publicHttpsUrl } from '../../security/outbound-url';

export type VideoPublishResult = { ok: boolean; status: 'sent' | 'processing'; externalId?: string; error?: string; httpStatus?: number; transient?: boolean };

export async function publishShortVideo(env: Env, connection: any, post: any): Promise<VideoPublishResult> {
  const loaded = await loadConnection(env, connection);
  if (connection.platform === 'youtube') return publishYoutube(loaded.credentials, post);
  if (connection.platform === 'tiktok') return publishTikTok(loaded.credentials, post);
  if (connection.platform === 'instagram') return publishInstagram(loaded.credentials, post);
  return { ok: false, status: 'sent', error: 'video_platform_unsupported' };
}

export async function checkShortVideoStatus(env: Env, connection: any, post: any, externalId: string): Promise<{ status: 'sent' | 'processing' | 'failed'; error?: string; externalId?: string; httpStatus?: number; transient?: boolean }> {
  const loaded = await loadConnection(env, connection);
  if (connection.platform === 'tiktok') return checkTikTok(loaded.credentials, externalId);
  if (connection.platform === 'instagram') return checkInstagram(loaded.credentials, externalId);
  return { status: 'sent', externalId };
}

async function loadConnection(env: Env, connection: any): Promise<{ credentials: any }> {
  if (!env.SOCIAL_CREDENTIAL_KEY) throw new Error('social_credential_key_missing');
  const credentials = JSON.parse(await openSeal(String(connection.credential_ciphertext), env.SOCIAL_CREDENTIAL_KEY));
  if ((!connection.expires_at || Number(connection.expires_at) > Date.now() + 5 * 60_000) && credentials?.access_token) return { credentials };
  if (!credentials?.refresh_token && connection.platform !== 'instagram') throw new Error(`${connection.platform}_refresh_credentials_missing`);
  if (connection.platform === 'youtube') {
    const response = await fetchWithTimeout('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.YOUTUBE_CLIENT_ID || '', client_secret: env.YOUTUBE_CLIENT_SECRET || '', grant_type: 'refresh_token', refresh_token: String(credentials.refresh_token) }) });
    const token = await response.json<any>().catch(() => ({}));
    if (!response.ok || !token.access_token) throw new Error(`youtube_refresh_failed_${response.status}`);
    return persistRefreshed(env, connection, { ...credentials, ...token, refresh_token: token.refresh_token || credentials.refresh_token }, Date.now() + Number(token.expires_in || 0) * 1000);
  }
  if (connection.platform === 'tiktok') {
    const response = await fetchWithTimeout('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY || '', client_secret: env.TIKTOK_CLIENT_SECRET || '', grant_type: 'refresh_token', refresh_token: String(credentials.refresh_token) }) });
    const payload = await response.json<any>().catch(() => ({}));
    const token = payload?.data;
    if (!response.ok || payload?.error?.code && payload.error.code !== 'ok' || !token?.access_token) throw new Error(`tiktok_refresh_failed_${response.status}`);
    return persistRefreshed(env, connection, { ...credentials, ...token, refresh_token: token.refresh_token || credentials.refresh_token }, Date.now() + Number(token.expires_in || 0) * 1000);
  }
  const refreshUrl = new URL('https://graph.instagram.com/refresh_access_token');
  refreshUrl.searchParams.set('grant_type', 'ig_refresh_token');
  refreshUrl.searchParams.set('access_token', String(credentials.access_token || ''));
  const response = await fetchWithTimeout(refreshUrl);
  const token = await response.json<any>().catch(() => ({}));
  if (!response.ok || !token.access_token) throw new Error(`instagram_refresh_failed_${response.status}`);
  return persistRefreshed(env, connection, { ...credentials, access_token: token.access_token }, Date.now() + Number(token.expires_in || 0) * 1000);
}

async function persistRefreshed(env: Env, connection: any, credentials: any, expiresAt: number): Promise<{ credentials: any }> {
  const cipher = await seal(JSON.stringify(credentials), env.SOCIAL_CREDENTIAL_KEY!);
  await env.DB.prepare("UPDATE creator_account_connections SET credential_ciphertext=?,expires_at=?,status='connected',updated_at=? WHERE id=?").bind(cipher, expiresAt, Date.now(), connection.id).run();
  return { credentials };
}

async function publishYoutube(credentials: any, post: any): Promise<VideoPublishResult> {
  if (!credentials?.access_token) return failure('youtube_credentials_incomplete');
  const media = await mediaResponse(post.media_url);
  if (!media.ok || !media.body) return failure(`media_fetch_${media.status}`, media.status);
  const mediaType = String(media.headers.get('content-type') || 'video/mp4').split(';')[0];
  const upload = await fetchWithTimeout('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', { method: 'POST', headers: { authorization: `Bearer ${credentials.access_token}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': mediaType, ...(media.headers.get('content-length') ? { 'x-upload-content-length': media.headers.get('content-length')! } : {}) }, body: JSON.stringify({ snippet: { title: String(post.caption).split(/\r?\n/, 1)[0].slice(0, 100) || 'Orbit Short', description: String(post.caption).slice(0, 5000), categoryId: '22' }, status: { privacyStatus: String(post.youtube_privacy_status || 'private') } }) });
  const uploadUrl = upload.headers.get('location');
  if (!upload.ok || !uploadUrl) return failure(`youtube_upload_init_${upload.status}`, upload.status);
  const sent = await fetchWithTimeout(uploadUrl, { method: 'PUT', headers: { authorization: `Bearer ${credentials.access_token}`, 'content-type': mediaType, ...(media.headers.get('content-length') ? { 'content-length': media.headers.get('content-length')! } : {}) }, body: media.body });
  const result = await sent.json<any>().catch(() => ({}));
  if (!sent.ok || !result?.id) return failure(`youtube_upload_${sent.status}`, sent.status);
  return { ok: true, status: 'sent', externalId: String(result.id) };
}

async function publishTikTok(credentials: any, post: any): Promise<VideoPublishResult> {
  if (!credentials?.access_token) return failure('tiktok_credentials_incomplete');
  const info = await fetchWithTimeout('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', { method: 'POST', headers: { authorization: `Bearer ${credentials.access_token}`, 'content-type': 'application/json' }, body: '{}' });
  const infoPayload = await info.json<any>().catch(() => ({}));
  if (!info.ok || infoPayload?.error?.code && infoPayload.error.code !== 'ok') return failure(`tiktok_creator_info_${info.status}`, info.status);
  const creator = infoPayload?.data || {};
  const allowed = Array.isArray(creator.privacy_level_options) ? creator.privacy_level_options.map(String) : [];
  if (!post.tiktok_privacy_level || !allowed.includes(String(post.tiktok_privacy_level))) return failure('tiktok_privacy_not_allowed', 400);
  const response = await fetchWithTimeout('https://open.tiktokapis.com/v2/post/publish/video/init/', { method: 'POST', headers: { authorization: `Bearer ${credentials.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ post_info: { title: String(post.caption).slice(0, 2200), privacy_level: String(post.tiktok_privacy_level), disable_comment: Boolean(creator.comment_disabled) || Number(post.tiktok_allow_comment) !== 1, disable_duet: Boolean(creator.duet_disabled) || Number(post.tiktok_allow_duet) !== 1, disable_stitch: Boolean(creator.stitch_disabled) || Number(post.tiktok_allow_stitch) !== 1 }, source_info: { source: 'PULL_FROM_URL', video_url: String(post.media_url) } }) });
  const payload = await response.json<any>().catch(() => ({}));
  if (!response.ok || payload?.error?.code && payload.error.code !== 'ok' || !payload?.data?.publish_id) return failure(`tiktok_publish_${response.status}`, response.status);
  return { ok: true, status: 'processing', externalId: String(payload.data.publish_id) };
}

async function publishInstagram(credentials: any, post: any): Promise<VideoPublishResult> {
  const userId = String(credentials?.user_id || '');
  if (!credentials?.access_token || !userId) return failure('instagram_credentials_incomplete');
  const url = new URL(`https://graph.instagram.com/${encodeURIComponent(userId)}/media`);
  url.searchParams.set('media_type', 'REELS');
  url.searchParams.set('video_url', String(post.media_url));
  url.searchParams.set('caption', String(post.caption).slice(0, 2200));
  url.searchParams.set('share_to_feed', 'true');
  url.searchParams.set('access_token', String(credentials.access_token));
  const response = await fetchWithTimeout(url, { method: 'POST' });
  const payload = await response.json<any>().catch(() => ({}));
  if (!response.ok || !payload?.id) return failure(`instagram_container_${response.status}`, response.status);
  return { ok: true, status: 'processing', externalId: String(payload.id) };
}

async function checkTikTok(credentials: any, publishId: string): Promise<{ status: 'sent' | 'processing' | 'failed'; error?: string; externalId?: string; httpStatus?: number; transient?: boolean }> {
  const response = await fetchWithTimeout('https://open.tiktokapis.com/v2/post/publish/status/fetch/', { method: 'POST', headers: { authorization: `Bearer ${credentials.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ publish_id: publishId }) });
  const payload = await response.json<any>().catch(() => ({}));
  if (!response.ok || payload?.error?.code && payload.error.code !== 'ok') return { status: 'failed', error: `tiktok_status_${response.status}`, httpStatus: response.status, transient: response.status === 429 || response.status >= 500 };
  const state = String(payload?.data?.status || '').toUpperCase();
  if (state === 'PUBLISH_COMPLETE') return { status: 'sent', externalId: publishId };
  if (state === 'FAILED' || state === 'SEND_TO_USER_INBOX') return { status: 'failed', error: `tiktok_publish_${state.toLowerCase()}`, externalId: publishId };
  return { status: 'processing', externalId: publishId };
}

async function checkInstagram(credentials: any, containerId: string): Promise<{ status: 'sent' | 'processing' | 'failed'; error?: string; externalId?: string; httpStatus?: number; transient?: boolean }> {
  const check = new URL(`https://graph.instagram.com/${encodeURIComponent(containerId)}`);
  check.searchParams.set('fields', 'status_code,status');
  check.searchParams.set('access_token', String(credentials.access_token));
  const response = await fetchWithTimeout(check);
  const payload = await response.json<any>().catch(() => ({}));
  if (!response.ok) return { status: 'failed', error: `instagram_status_${response.status}`, httpStatus: response.status, transient: response.status === 429 || response.status >= 500 };
  const state = String(payload?.status_code || '').toUpperCase();
  if (state === 'ERROR') return { status: 'failed', error: String(payload?.status || 'instagram_container_error'), externalId: containerId };
  if (state !== 'FINISHED') return { status: 'processing', externalId: containerId };
  const publish = new URL(`https://graph.instagram.com/${encodeURIComponent(credentials.user_id)}/media_publish`);
  publish.searchParams.set('creation_id', containerId);
  publish.searchParams.set('access_token', String(credentials.access_token));
  const published = await fetchWithTimeout(publish, { method: 'POST' });
  const result = await published.json<any>().catch(() => ({}));
  if (!published.ok || !result?.id) return { status: 'failed', error: `instagram_publish_${published.status}`, httpStatus: published.status, transient: published.status === 429 || published.status >= 500 };
  return { status: 'sent', externalId: String(result.id) };
}

async function mediaResponse(rawUrl: string): Promise<Response> {
  const url = publicHttpsUrl(rawUrl);
  if (!url) return new Response(null, { status: 400 });
  return fetchWithTimeout(url, { redirect: 'error' }, 120_000);
}

function failure(error: string, httpStatus?: number): VideoPublishResult { return { ok: false, status: 'sent', error, httpStatus, transient: Boolean(httpStatus && (httpStatus === 429 || httpStatus >= 500)) }; }
