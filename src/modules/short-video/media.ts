import type { Env } from '../../types';
import { json } from '../../http/responses';
import { securityHeaders, withSecurityHeaders } from '../../security/headers';
import { audit } from '../../repositories/audit';
import { ALLOWED_SHORT_VIDEO_TYPES, MAX_SHORT_VIDEO_UPLOAD_BYTES, SHORT_VIDEO_UPLOAD_RETENTION_MS, normalizeShortVideoContentType } from './constants';

const TOKEN_PATTERN = /^[A-Za-z0-9]{32,80}$/;

export function shortVideoMediaUrl(env: Env, guildId: string, objectKey: string): string | null {
  const prefix = `short-video/${guildId}/`;
  if (!/^\d+$/.test(guildId) || !objectKey.startsWith(prefix)) return null;
  const token = objectKey.slice(prefix.length);
  if (!TOKEN_PATTERN.test(token)) return null;
  return new URL(`/media/short-video/${guildId}/${token}`, env.APP_ORIGIN).toString();
}

function storage(env: Env): R2Bucket | undefined {
  return env.orbit_storage || env.STORAGE;
}

export async function shortVideoUploadApi(request: Request, env: Env, guildId: string, actorId: string): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const bucket = storage(env);
  if (!bucket) return json({ error: 'short_video_storage_unavailable', detail: 'Direct video uploads are not configured yet. Add the orbit_storage R2 binding, or use a public HTTPS video URL.' }, 503);
  const size = Number(request.headers.get('content-length') || 0);
  if (!Number.isSafeInteger(size) || size <= 0) return json({ error: 'video_size_required', detail: 'Orbit needs the video size to validate this upload. Choose the file again from the browser.' }, 400);
  if (size > MAX_SHORT_VIDEO_UPLOAD_BYTES) return json({ error: 'video_file_too_large', detail: `Video files must be ${Math.floor(MAX_SHORT_VIDEO_UPLOAD_BYTES / 1_000_000)} MB or smaller.` }, 413);
  const fileName = safeFileName(request.headers.get('x-orbit-file-name'));
  const contentType = normalizeShortVideoContentType(request.headers.get('content-type'), fileName);
  if (!contentType) return json({ error: 'video_type_not_supported', detail: `Choose an MP4, MOV, or WebM video. Supported types: ${ALLOWED_SHORT_VIDEO_TYPES.join(', ')}.` }, 415);
  if (!request.body) return json({ error: 'video_file_required', detail: 'Choose a video file before uploading.' }, 400);

  const token = crypto.randomUUID().replaceAll('-', '');
  const objectKey = `short-video/${guildId}/${token}`;
  const now = Date.now();
  try {
    const object = await bucket.put(objectKey, request.body, {
      httpMetadata: { contentType, contentDisposition: 'inline' },
      customMetadata: { guild_id: guildId, uploaded_by: actorId, file_name: fileName },
    });
    if (!object) return json({ error: 'video_upload_failed', detail: 'Orbit could not store that video.' }, 502);
    const sizeBytes = Number(object.size || size);
    const inserted = await env.DB.prepare(`INSERT INTO short_video_media(guild_id,object_key,file_name,content_type,size_bytes,uploaded_by,uploaded_at,expires_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(guildId, objectKey, fileName, contentType, sizeBytes, actorId, now, now + SHORT_VIDEO_UPLOAD_RETENTION_MS).run();
    const mediaId = Number(inserted.meta.last_row_id);
    const mediaUrl = shortVideoMediaUrl(env, guildId, objectKey);
    if (!mediaId || !mediaUrl) throw new Error('short_video_media_url_failed');
    await audit(env, guildId, null, 'short_video_uploaded', { media_id: mediaId, file_name: fileName, content_type: contentType, size_bytes: sizeBytes }, actorId);
    return json({ ok: true, media_id: mediaId, media_url: mediaUrl, file_name: fileName, content_type: contentType, size_bytes: sizeBytes });
  } catch (error) {
    await bucket.delete(objectKey).catch(() => undefined);
    if (error instanceof Error && error.message === 'short_video_media_url_failed') return json({ error: 'video_upload_failed', detail: 'Orbit stored the file but could not register it for publishing. Try again.' }, 502);
    return json({ error: 'video_upload_failed', detail: 'Orbit could not store that video. Check the R2 binding and try again.' }, 502);
  }
}

export async function serveShortVideoMedia(request: Request, env: Env): Promise<Response> {
  const match = new URL(request.url).pathname.match(/^\/media\/short-video\/(\d+)\/([A-Za-z0-9]{32,80})$/);
  if (!match) return withSecurityHeaders(new Response('Not found', { status: 404 }));
  if (request.method !== 'GET' && request.method !== 'HEAD') return withSecurityHeaders(new Response(null, { status: 405, headers: { allow: 'GET, HEAD', ...securityHeaders() } }));
  const bucket = storage(env);
  if (!bucket) return withSecurityHeaders(new Response('Not found', { status: 404 }));
  const object = await bucket.get(`short-video/${match[1]}/${match[2]}`);
  if (!object) return withSecurityHeaders(new Response('Not found', { status: 404 }));
  const headers = new Headers({
    'cache-control': 'public, max-age=3600',
    'content-disposition': 'inline',
    'content-length': String(object.size),
    'accept-ranges': 'bytes',
  });
  if (object.httpMetadata?.contentType) headers.set('content-type', object.httpMetadata.contentType);
  if (object.httpEtag) headers.set('etag', object.httpEtag);
  return withSecurityHeaders(new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers }));
}

export async function cleanupExpiredShortVideoMedia(env: Env): Promise<void> {
  const bucket = storage(env);
  if (!bucket) return;
  const expired = await env.DB.prepare(`SELECT id,object_key FROM short_video_media m
    WHERE m.expires_at<=? AND NOT EXISTS (SELECT 1 FROM short_video_posts p WHERE p.media_key=m.object_key)
    ORDER BY m.expires_at ASC LIMIT 20`).bind(Date.now()).all<any>();
  for (const row of expired.results) {
    await bucket.delete(String(row.object_key)).catch(() => undefined);
    await env.DB.prepare('DELETE FROM short_video_media WHERE id=? AND object_key=?').bind(Number(row.id), String(row.object_key)).run();
  }
}

function safeFileName(raw: string | null): string {
  let value = String(raw || 'orbit-video.mp4');
  try { value = decodeURIComponent(value); } catch { /* keep the encoded name */ }
  value = value.replace(/[\\/\0]/g, '-').replace(/[^a-zA-Z0-9._ -]/g, '-').trim().slice(0, 120);
  return value || 'orbit-video.mp4';
}
