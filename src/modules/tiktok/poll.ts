import type { Env } from '../../types';
import { fetchWithTimeout } from '../../http/fetch-timeout';
import { openSeal, seal } from '../../security/crypto';
import { sendDiscordMessage } from '../../discord/messages';
import { recordSystemError } from '../../repositories/errors';

type TikTokVideo = {
  id: string;
  title?: string;
  video_description?: string;
  share_url?: string;
  embed_link?: string;
  create_time?: number;
};

export async function pollTikTokAnnouncements(env: Env): Promise<void> {
  if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET || !env.SOCIAL_CREDENTIAL_KEY) return;
  const now = Date.now();
  const configs = await env.DB.prepare(`SELECT c.*,a.account_id,a.account_label,a.credential_ciphertext,a.expires_at,a.status
    FROM tiktok_announce_configs c JOIN creator_account_connections a ON a.id=c.connection_id
    WHERE c.enabled=1 AND a.status='connected' AND (c.last_checked_at IS NULL OR c.last_checked_at + c.poll_interval_minutes * 60000 <= ?)
    ORDER BY COALESCE(c.last_checked_at,0) ASC LIMIT 20`).bind(now).all<any>();
  for (const config of configs.results) {
    try {
      const accessToken = await accessTokenFor(env, config);
      const videos = await listVideos(accessToken);
      await announceVideos(env, config, videos);
      await env.DB.prepare('UPDATE tiktok_announce_configs SET last_checked_at=?,last_error=NULL,updated_at=? WHERE id=?').bind(now, now, config.id).run();
    } catch (error: any) {
      const message = String(error?.message || 'TikTok polling failed').slice(0, 300);
      await env.DB.prepare('UPDATE tiktok_announce_configs SET last_checked_at=?,last_error=?,updated_at=? WHERE id=?').bind(now, message, now, config.id).run();
      await recordSystemError(env, String(config.guild_id), '/v2/video/list/', 'POST', 502, 'tiktok_announcement_poll_failed', { connection_id: config.connection_id, message });
    }
  }
}

async function accessTokenFor(env: Env, config: any): Promise<string> {
  if (!env.SOCIAL_CREDENTIAL_KEY) throw new Error('social_credential_key_missing');
  const credentials = JSON.parse(await openSeal(String(config.credential_ciphertext), env.SOCIAL_CREDENTIAL_KEY));
  if (credentials?.access_token && Number(config.expires_at || 0) > Date.now() + 5 * 60_000) return String(credentials.access_token);
  if (!credentials?.refresh_token || !env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) throw new Error('tiktok_refresh_credentials_missing');
  const response = await fetchWithTimeout('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: String(credentials.refresh_token) }),
  });
  const payload = await response.json<any>().catch(() => ({}));
  const token = payload?.data;
  if (!response.ok || payload?.error?.code && payload.error.code !== 'ok' || !token?.access_token) throw new Error(`tiktok_refresh_failed_${response.status}`);
  const updatedCredentials = { ...credentials, ...token, refresh_token: token.refresh_token || credentials.refresh_token };
  const cipher = await seal(JSON.stringify(updatedCredentials), env.SOCIAL_CREDENTIAL_KEY);
  const expiresAt = Date.now() + Number(token.expires_in || 0) * 1000;
  await env.DB.prepare(`UPDATE creator_account_connections SET credential_ciphertext=?,expires_at=?,status='connected',updated_at=? WHERE id=?`)
    .bind(cipher, expiresAt, Date.now(), config.connection_id).run();
  return String(token.access_token);
}

async function listVideos(accessToken: string): Promise<TikTokVideo[]> {
  const url = new URL('https://open.tiktokapis.com/v2/video/list/');
  url.searchParams.set('fields', 'id,create_time,title,video_description,share_url,embed_link');
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ max_count: 20 }),
  });
  const payload = await response.json<any>().catch(() => ({}));
  if (!response.ok || payload?.error?.code && payload.error.code !== 'ok') throw new Error(`tiktok_video_list_failed_${response.status}`);
  return (Array.isArray(payload?.data?.videos) ? payload.data.videos : [])
    .filter((video: any) => video?.id)
    .sort((a: TikTokVideo, b: TikTokVideo) => Number(b.create_time || 0) - Number(a.create_time || 0));
}

async function announceVideos(env: Env, config: any, videos: TikTokVideo[]): Promise<void> {
  const knownCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM tiktok_announcement_videos WHERE config_id=?').bind(config.id).first<any>();
  if (!Number(knownCount?.count || 0)) {
    for (const video of videos) await rememberVideo(env, config.id, video, null);
    return;
  }
  const pending: TikTokVideo[] = [];
  for (const video of videos) {
    const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO tiktok_announcement_videos(config_id,video_id,title,video_url,created_at,announced_at)
      VALUES(?,?,?,?,?,NULL)`).bind(config.id, String(video.id), video.title || video.video_description || null, video.share_url || video.embed_link || null, Number(video.create_time || 0) * 1000 || null).run();
    if (inserted.meta.changes) pending.push(video);
  }
  for (const video of pending.sort((a, b) => Number(a.create_time || 0) - Number(b.create_time || 0)).slice(0, 5)) {
    const content = renderTemplate(String(config.message_template), config, video);
    const response = await sendDiscordMessage(env, String(config.discord_channel_id), { content });
    if (!response.ok) throw new Error(`discord_tiktok_announcement_failed_${response.status}`);
    await env.DB.prepare('UPDATE tiktok_announcement_videos SET announced_at=? WHERE config_id=? AND video_id=?').bind(Date.now(), config.id, String(video.id)).run();
  }
}

async function rememberVideo(env: Env, configId: number, video: TikTokVideo, announcedAt: number | null): Promise<void> {
  await env.DB.prepare(`INSERT OR IGNORE INTO tiktok_announcement_videos(config_id,video_id,title,video_url,created_at,announced_at)
    VALUES(?,?,?,?,?,?)`).bind(configId, String(video.id), video.title || video.video_description || null, video.share_url || video.embed_link || null, Number(video.create_time || 0) * 1000 || null, announcedAt).run();
}

function renderTemplate(template: string, config: any, video: TikTokVideo): string {
  const values: Record<string, string> = {
    account: String(config.account_label || config.account_id || 'TikTok'),
    title: String(video.title || video.video_description || 'New TikTok video'),
    description: String(video.video_description || ''),
    url: String(video.share_url || video.embed_link || `https://www.tiktok.com/@${config.account_id}/video/${video.id}`),
  };
  const rendered = template.replace(/\{(account|title|description|url)\}/g, (_match, key) => values[key] || '');
  return rendered.slice(0, 2000);
}
