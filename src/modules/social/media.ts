import type { Env } from '../../types';
import { json } from '../../http/responses';
import { securityHeaders, withSecurityHeaders } from '../../security/headers';
import { audit } from '../../repositories/audit';
import { ALLOWED_SOCIAL_IMAGE_TYPES, MAX_SOCIAL_IMAGE_UPLOAD_BYTES, MAX_SOCIAL_IMAGES, normalizeSocialImageContentType, SOCIAL_IMAGE_UPLOAD_RETENTION_MS } from './constants';

const TOKEN_PATTERN = /^[A-Za-z0-9]{32,80}$/;

export type SocialMediaRow = {
  id: number;
  guild_id: string;
  object_key: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  alt_text: string;
};

export type SocialMediaAsset = SocialMediaRow & {
  public_url: string;
  data: ArrayBuffer;
};

function storage(env: Env): R2Bucket | undefined {
  return env.orbit_storage || env.STORAGE;
}

export function socialMediaUrl(env: Env, guildId: string, objectKey: string): string | null {
  const prefix = `social/${guildId}/`;
  if (!/^\d+$/.test(guildId) || !objectKey.startsWith(prefix)) return null;
  const token = objectKey.slice(prefix.length);
  if (!TOKEN_PATTERN.test(token)) return null;
  return new URL(`/media/social/${guildId}/${token}`, env.APP_ORIGIN).toString();
}

export async function socialImageUploadApi(request: Request, env: Env, guildId: string, actorId: string): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const bucket = storage(env);
  if (!bucket) return json({ error: 'social_image_storage_unavailable', detail: 'Direct image uploads are not configured yet. Add the orbit_storage R2 binding.' }, 503);
  const size = Number(request.headers.get('content-length') || 0);
  if (!Number.isSafeInteger(size) || size <= 0) return json({ error: 'image_size_required', detail: 'Orbit needs the image size to validate this upload. Choose the file again from the browser.' }, 400);
  if (size > MAX_SOCIAL_IMAGE_UPLOAD_BYTES) return json({ error: 'image_file_too_large', detail: `Images must be ${Math.floor(MAX_SOCIAL_IMAGE_UPLOAD_BYTES / 1_000_000)} MB or smaller.` }, 413);
  const fileName = safeFileName(request.headers.get('x-orbit-file-name'));
  const altText = safeAltText(request.headers.get('x-orbit-alt-text'));
  const contentType = normalizeSocialImageContentType(request.headers.get('content-type'), fileName);
  if (!contentType) return json({ error: 'image_type_not_supported', detail: `Choose a JPEG, PNG, GIF, or WebP image. Supported types: ${ALLOWED_SOCIAL_IMAGE_TYPES.join(', ')}.` }, 415);
  if (!request.body) return json({ error: 'image_file_required', detail: 'Choose an image before uploading.' }, 400);

  const token = crypto.randomUUID().replaceAll('-', '');
  const objectKey = `social/${guildId}/${token}`;
  const now = Date.now();
  try {
    const object = await bucket.put(objectKey, request.body, {
      httpMetadata: { contentType, contentDisposition: 'inline' },
      customMetadata: { guild_id: guildId, uploaded_by: actorId, file_name: fileName },
    });
    if (!object) return json({ error: 'image_upload_failed', detail: 'Orbit could not store that image.' }, 502);
    const inserted = await env.DB.prepare(`INSERT INTO social_media(guild_id,object_key,file_name,content_type,size_bytes,alt_text,uploaded_by,uploaded_at,expires_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(guildId, objectKey, fileName, contentType, Number(object.size || size), altText, actorId, now, now + SOCIAL_IMAGE_UPLOAD_RETENTION_MS).run();
    const mediaId = Number(inserted.meta.last_row_id);
    const mediaUrl = socialMediaUrl(env, guildId, objectKey);
    if (!mediaId || !mediaUrl) throw new Error('social_media_url_failed');
    await audit(env, guildId, null, 'social_image_uploaded', { media_id: mediaId, file_name: fileName, content_type: contentType, size_bytes: Number(object.size || size) }, actorId);
    return json({ ok: true, media_id: mediaId, media_url: mediaUrl, file_name: fileName, content_type: contentType, alt_text: altText, size_bytes: Number(object.size || size) });
  } catch (error) {
    await bucket.delete(objectKey).catch(() => undefined);
    if (error instanceof Error && error.message === 'social_media_url_failed') return json({ error: 'image_upload_failed', detail: 'Orbit stored the image but could not register it for publishing. Try again.' }, 502);
    return json({ error: 'image_upload_failed', detail: 'Orbit could not store that image. Check the R2 binding and try again.' }, 502);
  }
}

export async function serveSocialMedia(request: Request, env: Env): Promise<Response> {
  const match = new URL(request.url).pathname.match(/^\/media\/social\/(\d+)\/([A-Za-z0-9]{32,80})$/);
  if (!match) return withSecurityHeaders(new Response('Not found', { status: 404 }));
  if (request.method !== 'GET' && request.method !== 'HEAD') return withSecurityHeaders(new Response(null, { status: 405, headers: { allow: 'GET, HEAD', ...securityHeaders() } }));
  const bucket = storage(env);
  if (!bucket) return withSecurityHeaders(new Response('Not found', { status: 404 }));
  const object = await bucket.get(`social/${match[1]}/${match[2]}`);
  if (!object) return withSecurityHeaders(new Response('Not found', { status: 404 }));
  const headers = new Headers({ 'cache-control': 'public, max-age=3600', 'content-disposition': 'inline', 'content-length': String(object.size), 'accept-ranges': 'bytes' });
  if (object.httpMetadata?.contentType) headers.set('content-type', object.httpMetadata.contentType);
  if (object.httpEtag) headers.set('etag', object.httpEtag);
  return withSecurityHeaders(new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers }));
}

export async function loadSocialMediaAssets(env: Env, rows: SocialMediaRow[]): Promise<SocialMediaAsset[]> {
  if (!rows.length) return [];
  const bucket = storage(env);
  if (!bucket) throw new Error('social_media_storage_unavailable');
  const assets: SocialMediaAsset[] = [];
  for (const row of rows) {
    const publicUrl = socialMediaUrl(env, row.guild_id, row.object_key);
    if (!publicUrl) throw new Error('social_media_url_invalid');
    const object = await bucket.get(row.object_key);
    if (!object) throw new Error('social_media_not_found');
    assets.push({ ...row, public_url: publicUrl, data: await object.arrayBuffer() });
  }
  return assets;
}

export async function cleanupExpiredSocialMedia(env: Env): Promise<void> {
  const bucket = storage(env);
  if (!bucket) return;
  const expired = await env.DB.prepare('SELECT id,object_key,guild_id FROM social_media WHERE expires_at<=? ORDER BY expires_at ASC LIMIT 20').bind(Date.now()).all<any>();
  for (const row of expired.results) {
    const pending = await env.DB.prepare(`SELECT media_ids_json FROM social_publish_posts
      WHERE guild_id=? AND status IN ('draft','queued','scheduled','sending','partial')`).bind(String(row.guild_id)).all<any>();
    const referenced = pending.results.some((post: any) => parseIds(post.media_ids_json).includes(Number(row.id)));
    if (referenced) continue;
    await bucket.delete(String(row.object_key)).catch(() => undefined);
    await env.DB.prepare('DELETE FROM social_media WHERE id=? AND guild_id=?').bind(Number(row.id), String(row.guild_id)).run();
  }
}

function parseIds(raw: unknown): number[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.map(Number).filter(id => Number.isInteger(id) && id > 0).slice(0, MAX_SOCIAL_IMAGES) : [];
  } catch { return []; }
}

function safeFileName(raw: string | null): string {
  let value = String(raw || 'orbit-image');
  try { value = decodeURIComponent(value); } catch { /* keep the encoded name */ }
  value = value.replace(/[\\/\0]/g, '-').replace(/[^a-zA-Z0-9._ -]/g, '-').trim().slice(0, 120);
  return value || 'orbit-image';
}

function safeAltText(raw: string | null): string {
  return String(raw || '').replace(/[\0\r\n]/g, ' ').trim().slice(0, 1000);
}
