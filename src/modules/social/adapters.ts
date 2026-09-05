import type { Env } from '../../types';
import { openSeal } from '../../security/crypto';
import { publicHttpsUrl } from '../../security/outbound-url';
import { fetchWithTimeout } from '../../http/fetch-timeout';
import type { SocialMediaAsset } from './media';

export type PublishResult = { ok: boolean; externalId?: string; error?: string; status?: number; transient?: boolean };

export async function publishExternal(env: Env, integration: any, content: string, idempotencyKey: string, media: SocialMediaAsset[] = []): Promise<PublishResult> {
  if (!integration.credential_ciphertext || !env.SOCIAL_CREDENTIAL_KEY) return { ok: false, error: 'credentials_missing' };
  let cred: any;
  try { cred = JSON.parse(await openSeal(integration.credential_ciphertext, env.SOCIAL_CREDENTIAL_KEY)); } catch { return { ok: false, error: 'credentials_unreadable' }; }
  if (integration.platform === 'bluesky') return bluesky(cred, content, media);
  if (integration.platform === 'mastodon') return mastodon(cred, content, idempotencyKey, media);
  if (integration.platform === 'threads') return threads(cred, content, media);
  return { ok: false, error: 'publishing_not_supported_for_platform' };
}

async function bluesky(c: any, text: string, media: SocialMediaAsset[]): Promise<PublishResult> {
  if (!c.identifier || !c.app_password) return { ok: false, error: 'bluesky_credentials_incomplete' };
  const auth = await timedFetch('https://bsky.social/xrpc/com.atproto.server.createSession', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: c.identifier, password: c.app_password }) });
  if (!auth.ok) return failure('bluesky_auth', auth.status);
  const a = await auth.json<any>();
  const images: any[] = [];
  for (const asset of media.slice(0, 4)) {
    const upload = await timedFetch('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', { method: 'POST', headers: { authorization: `Bearer ${a.accessJwt}`, 'content-type': asset.content_type }, body: asset.data });
    if (!upload.ok) return failure('bluesky_media_upload', upload.status);
    const uploaded = await upload.json<any>();
    if (!uploaded?.blob) return { ok: false, error: 'bluesky_media_upload_invalid' };
    images.push({ alt: String(asset.alt_text || asset.file_name).slice(0, 200), image: uploaded.blob });
  }
  const record: any = { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString() };
  if (images.length) record.embed = { $type: 'app.bsky.embed.images', images };
  const post = await timedFetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', { method: 'POST', headers: { authorization: `Bearer ${a.accessJwt}`, 'content-type': 'application/json' }, body: JSON.stringify({ repo: a.did, collection: 'app.bsky.feed.post', record }) });
  if (!post.ok) return failure('bluesky_post', post.status);
  const data = await post.json<any>();
  return { ok: true, externalId: data.uri };
}

async function mastodon(c: any, text: string, idempotencyKey: string, media: SocialMediaAsset[]): Promise<PublishResult> {
  if (!c.instance || !c.access_token) return { ok: false, error: 'mastodon_credentials_incomplete' };
  const base = publicHttpsUrl(String(c.instance).replace(/\/$/, ''));
  if (!base) return { ok: false, error: 'mastodon_instance_invalid' };
  const mediaIds: string[] = [];
  for (const [index, asset] of media.entries()) {
    const form = new FormData();
    form.append('file', new Blob([asset.data], { type: asset.content_type }), asset.file_name);
    if (asset.alt_text) form.append('description', asset.alt_text.slice(0, 1500));
    const upload = await timedFetch(new URL('/api/v2/media', base), { method: 'POST', headers: { authorization: `Bearer ${c.access_token}`, 'idempotency-key': `${idempotencyKey}-media-${index}` }, body: form, redirect: 'error' });
    if (!upload.ok) return failure('mastodon_media_upload', upload.status);
    const uploaded = await upload.json<any>();
    if (!uploaded?.id) return { ok: false, error: 'mastodon_media_upload_invalid' };
    mediaIds.push(String(uploaded.id));
  }
  const endpoint = new URL('/api/v1/statuses', base);
  const form = new FormData();
  form.append('status', text);
  mediaIds.forEach(id => form.append('media_ids[]', id));
  const response = await timedFetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${c.access_token}`, 'idempotency-key': idempotencyKey }, body: form, redirect: 'error' });
  if (!response.ok) return failure('mastodon_post', response.status);
  const data = await response.json<any>();
  return { ok: true, externalId: data.id };
}

async function threads(c: any, text: string, media: SocialMediaAsset[]): Promise<PublishResult> {
  if (!c.user_id || !c.access_token) return { ok: false, error: 'threads_credentials_incomplete' };
  let creationId: string | null = null;
  if (!media.length) {
    const make = new URL(`https://graph.threads.net/v1.0/${encodeURIComponent(c.user_id)}/threads`);
    make.searchParams.set('media_type', 'TEXT'); make.searchParams.set('text', text); make.searchParams.set('access_token', c.access_token);
    const response = await timedFetch(make, { method: 'POST' });
    if (!response.ok) return failure('threads_create', response.status);
    creationId = String((await response.json<any>()).id || '');
  } else if (media.length === 1) {
    const make = new URL(`https://graph.threads.net/v1.0/${encodeURIComponent(c.user_id)}/threads`);
    make.searchParams.set('media_type', 'IMAGE'); make.searchParams.set('image_url', media[0].public_url); if (text) make.searchParams.set('text', text); make.searchParams.set('access_token', c.access_token);
    const response = await timedFetch(make, { method: 'POST' });
    if (!response.ok) return failure('threads_create_image', response.status);
    creationId = String((await response.json<any>()).id || '');
  } else {
    const children: string[] = [];
    for (const asset of media.slice(0, 10)) {
      const child = new URL(`https://graph.threads.net/v1.0/${encodeURIComponent(c.user_id)}/threads`);
      child.searchParams.set('media_type', 'IMAGE'); child.searchParams.set('image_url', asset.public_url); child.searchParams.set('is_carousel_item', 'true'); child.searchParams.set('access_token', c.access_token);
      const response = await timedFetch(child, { method: 'POST' });
      if (!response.ok) return failure('threads_carousel_item', response.status);
      children.push(String((await response.json<any>()).id || ''));
    }
    const make = new URL(`https://graph.threads.net/v1.0/${encodeURIComponent(c.user_id)}/threads`);
    make.searchParams.set('media_type', 'CAROUSEL'); make.searchParams.set('children', children.join(',')); if (text) make.searchParams.set('text', text); make.searchParams.set('access_token', c.access_token);
    const response = await timedFetch(make, { method: 'POST' });
    if (!response.ok) return failure('threads_carousel', response.status);
    creationId = String((await response.json<any>()).id || '');
  }
  if (!creationId) return { ok: false, error: 'threads_creation_invalid' };
  const publish = new URL(`https://graph.threads.net/v1.0/${encodeURIComponent(c.user_id)}/threads_publish`);
  publish.searchParams.set('creation_id', creationId); publish.searchParams.set('access_token', c.access_token);
  const response = await timedFetch(publish, { method: 'POST' });
  if (!response.ok) return failure('threads_publish', response.status);
  const output = await response.json<any>();
  return { ok: true, externalId: output.id };
}

function failure(prefix: string, status: number): PublishResult { return { ok: false, error: `${prefix}_${status}`, status, transient: status === 429 || status >= 500 }; }
function timedFetch(input: string | URL, init: RequestInit): Promise<Response> { return fetchWithTimeout(input, init, 20_000); }
