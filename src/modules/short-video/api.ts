import type { Env } from '../../types';
import { json } from '../../http/responses';
import { publicHttpsUrl } from '../../security/outbound-url';

const VIDEO_TARGETS = ['youtube', 'tiktok', 'instagram'];
const REQUIRED_SCOPES: Record<string, string> = { youtube: 'https://www.googleapis.com/auth/youtube.upload', tiktok: 'video.publish', instagram: 'instagram_business_content_publish' };

export async function shortVideoApi(request: Request, env: Env, guildId: string, actorId: string): Promise<Response> {
  if (request.method === 'GET') {
    const [posts, connections] = await Promise.all([
      env.DB.prepare('SELECT * FROM short_video_posts WHERE guild_id=? ORDER BY scheduled_for ASC,created_at DESC LIMIT 100').bind(guildId).all(),
      env.DB.prepare(`SELECT id,platform,account_id,account_label,status,scopes_json,expires_at FROM creator_account_connections
        WHERE guild_id=? AND platform IN ('youtube','tiktok','instagram') ORDER BY platform,account_label`).bind(guildId).all(),
    ]);
    return json({ posts: posts.results, connections: connections.results, targets: VIDEO_TARGETS });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const body = await request.json<any>();
  if (body.op === 'action') return action(env, guildId, body);
  if (body.op !== 'create') return json({ error: 'unsupported_short_video_operation' }, 400);

  const targets: string[] = Array.isArray(body.targets) ? Array.from(new Set<string>(body.targets.filter((value: any) => VIDEO_TARGETS.includes(value)).map(String))) : [];
  const mediaUrl = publicHttpsUrl(body.media_url);
  const caption = String(body.caption || '').trim();
  const scheduledFor = Number(body.scheduled_for || Date.now());
  if (!mediaUrl || !targets.length || !caption || caption.length > 2200) return json({ error: 'invalid_short_video', detail: 'Provide a public HTTPS video URL, caption, and at least one connected platform. Captions must be 2,200 characters or fewer.' }, 400);
  if (!Number.isFinite(scheduledFor) || scheduledFor < Date.now() - 60_000) return json({ error: 'invalid_schedule', detail: 'Choose a valid current or future time.' }, 400);
  const youtubePrivacy = ['private', 'unlisted', 'public'].includes(String(body.youtube_privacy_status)) ? String(body.youtube_privacy_status) : 'private';
  const tiktokPrivacy = String(body.tiktok_privacy_level || '');
  if (targets.includes('tiktok') && !tiktokPrivacy) return json({ error: 'tiktok_privacy_required', detail: 'Choose a TikTok privacy level before posting.' }, 400);

  const connections = await env.DB.prepare(`SELECT platform,status,scopes_json FROM creator_account_connections
    WHERE guild_id=? AND platform IN ('youtube','tiktok','instagram') AND status='connected'`).bind(guildId).all<any>();
  const byPlatform = new Map(connections.results.map((row: any) => [row.platform, row]));
  for (const platform of targets) {
    const connection = byPlatform.get(platform);
    if (!connection) return json({ error: 'platform_not_connected', detail: `Connect ${platform} in Connections before posting a video.`, platform }, 400);
    const scopes = parseScopes(connection.scopes_json);
    if (!scopes.includes(REQUIRED_SCOPES[platform])) return json({ error: 'reauthorize_required', detail: `Reconnect ${platform} in Connections to grant its video publishing permission.`, platform }, 409);
  }

  const now = Date.now();
  const status = scheduledFor <= now ? 'queued' : 'scheduled';
  const result = await env.DB.prepare(`INSERT INTO short_video_posts(guild_id,media_url,caption,targets_json,youtube_privacy_status,tiktok_privacy_level,tiktok_allow_comment,tiktok_allow_duet,tiktok_allow_stitch,scheduled_for,status,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?, ?,?,?)`).bind(guildId, mediaUrl.toString(), caption, JSON.stringify(targets), youtubePrivacy, tiktokPrivacy || null, body.tiktok_allow_comment ? 1 : 0, body.tiktok_allow_duet ? 1 : 0, body.tiktok_allow_stitch ? 1 : 0, scheduledFor, status, actorId, now, now).run();
  const id = Number(result.meta.last_row_id);
  if (status === 'queued' && env.JOBS) await env.JOBS.send({ type: 'short-video-dispatch', shortVideoPostId: id });
  return json({ ok: true, id, status });
}

async function action(env: Env, guildId: string, body: any): Promise<Response> {
  const id = Number(body.id);
  if (!Number.isInteger(id)) return json({ error: 'invalid_short_video' }, 400);
  const post = await env.DB.prepare('SELECT id,status FROM short_video_posts WHERE id=? AND guild_id=?').bind(id, guildId).first<any>();
  if (!post) return json({ error: 'not_found' }, 404);
  const now = Date.now();
  if (body.action === 'send_now' || body.action === 'retry') {
    await env.DB.prepare("UPDATE short_video_posts SET scheduled_for=?,status='queued',dispatch_lease_until=NULL,last_error=NULL,updated_at=? WHERE id=? AND guild_id=?").bind(now, now, id, guildId).run();
    if (env.JOBS) await env.JOBS.send({ type: 'short-video-dispatch', shortVideoPostId: id });
  } else if (body.action === 'cancel') {
    await env.DB.prepare("UPDATE short_video_posts SET status='cancelled',dispatch_lease_until=NULL,updated_at=? WHERE id=? AND guild_id=? AND status IN ('scheduled','queued')").bind(now, id, guildId).run();
  } else if (body.action === 'delete') {
    await env.DB.prepare('DELETE FROM short_video_posts WHERE id=? AND guild_id=?').bind(id, guildId).run();
  } else return json({ error: 'unsupported_short_video_action' }, 400);
  return json({ ok: true });
}

function parseScopes(raw: any): string[] {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? value.map(String) : [];
  } catch { return []; }
}
