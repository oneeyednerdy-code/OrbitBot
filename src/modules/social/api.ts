import type { Env } from '../../types';
import { json } from '../../http/responses';
import { seal } from '../../security/crypto';
import { loadGuildResources, validateChannelIds, validateRoleIds } from '../../discord/guild-resources';
import { textLength, textLimitsForIntegrations } from './limits';
import { MAX_SOCIAL_IMAGE_UPLOAD_BYTES, MAX_SOCIAL_IMAGES } from './constants';
import type { SocialMediaRow } from './media';

export const SOCIAL_TARGETS = ['discord', 'threads', 'bluesky', 'mastodon'];

export async function socialApi(request: Request, env: Env, guildId: string, actorId: string): Promise<Response> {
  if (request.method === 'GET') {
    const [posts, rows, templates, runs] = await Promise.all([
      env.DB.prepare("SELECT * FROM social_publish_posts WHERE guild_id=? ORDER BY CASE WHEN status IN ('scheduled','queued') AND scheduled_for IS NOT NULL THEN 0 ELSE 1 END, CASE WHEN status IN ('scheduled','queued') AND scheduled_for IS NOT NULL THEN scheduled_for END ASC, COALESCE(updated_at,created_at) DESC LIMIT 250").bind(guildId).all(),
      env.DB.prepare('SELECT * FROM social_integrations WHERE guild_id=? ORDER BY platform,account_label').bind(guildId).all(),
      env.DB.prepare('SELECT id,name,content,content_variants_json,targets_json,campaign,created_at,updated_at FROM social_templates WHERE guild_id=? ORDER BY name').bind(guildId).all(),
      env.DB.prepare('SELECT * FROM social_publish_runs WHERE guild_id=? ORDER BY attempted_at DESC LIMIT 500').bind(guildId).all(),
    ]);
    const limits = await textLimitsForIntegrations(env, rows.results as any[]);
    const integrations = (rows.results as any[]).map(({ credential_ciphertext, ...safe }) => safe);
    return json({ posts: posts.results, runs: runs.results, templates: templates.results, integrations, limits, platforms: SOCIAL_TARGETS, image_upload_enabled: Boolean(env.orbit_storage || env.STORAGE), max_image_bytes: MAX_SOCIAL_IMAGE_UPLOAD_BYTES, max_images: MAX_SOCIAL_IMAGES, image_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const b = await request.json<any>();
  if (b.op === 'connect_discord') return connectDiscord(env, guildId, b);
  if (b.op === 'connect') return connectSocial(env, guildId, b);
  if (b.op === 'save_template') return saveTemplate(env, guildId, actorId, b);
  if (b.op === 'delete_template') return deleteTemplate(env, guildId, b);
  if (b.op === 'delete_post') return deletePost(env, guildId, b);
  if (b.op === 'action') return socialAction(env, guildId, b);
  if (b.op === 'save_draft' || b.op === 'update' || b.op === 'queue' || !b.op) return savePost(env, guildId, actorId, b);
  return json({ error: 'invalid_operation' }, 400);
}

async function connectDiscord(env: Env, guildId: string, body: any): Promise<Response> {
  if (!body.discord_channel_id) return json({ error: 'channel_required' }, 400);
  const resources = await loadGuildResources(env, guildId, { channels: true });
  if (!resources.ok) return json(resources, resources.status);
  const invalid = validateChannelIds(resources, [body.discord_channel_id]);
  if (invalid) return json(invalid, invalid.status);
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO social_integrations(guild_id,platform,account_label,credential_ref,discord_channel_id,settings_json,enabled,created_at,updated_at)
    VALUES(?,?,?,?,?,?,1,?,?) ON CONFLICT(guild_id,platform,account_label) DO UPDATE SET discord_channel_id=excluded.discord_channel_id,enabled=1,updated_at=excluded.updated_at`)
    .bind(guildId, 'discord', 'Default', null, String(body.discord_channel_id), '{}', now, now).run();
  return json({ ok: true });
}

async function connectSocial(env: Env, guildId: string, body: any): Promise<Response> {
  if (!env.SOCIAL_CREDENTIAL_KEY) return json({ error: 'social_credential_key_missing' }, 500);
  if (!['threads', 'bluesky', 'mastodon'].includes(body.platform) || !body.account_label || !body.credentials) return json({ error: 'invalid_integration' }, 400);
  const cipher = await seal(JSON.stringify(body.credentials), env.SOCIAL_CREDENTIAL_KEY);
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO social_integrations(guild_id,platform,account_label,credential_ref,discord_channel_id,settings_json,enabled,created_at,updated_at,credential_ciphertext,status)
    VALUES(?,?,?,?,?,?,1,?,?,?,'configured') ON CONFLICT(guild_id,platform,account_label) DO UPDATE SET credential_ciphertext=excluded.credential_ciphertext,enabled=1,updated_at=excluded.updated_at,status='configured'`)
    .bind(guildId, body.platform, String(body.account_label), null, body.discord_channel_id || null, '{}', now, now, cipher).run();
  return json({ ok: true });
}

async function saveTemplate(env: Env, guildId: string, actorId: string, body: any): Promise<Response> {
  const name = String(body.name || '').trim().slice(0, 120);
  const content = String(body.content || '');
  const targets = normalizeTargets(body.targets);
  const variants = normalizeVariants(body.variants ?? body.content_variants);
  if (!name || (!content.trim() && !Object.values(variants).some(value => value.trim())) || !targets.length) return json({ error: 'invalid_template', detail: 'Give the template a name, message, and at least one destination.' }, 400);
  const id = Number(body.id || 0);
  const now = Date.now();
  const campaign = cleanCampaign(body.campaign);
  if (id) {
    const existing = await env.DB.prepare('SELECT id FROM social_templates WHERE id=? AND guild_id=?').bind(id, guildId).first();
    if (!existing) return json({ error: 'template_not_found' }, 404);
    await env.DB.prepare('UPDATE social_templates SET name=?,content=?,content_variants_json=?,targets_json=?,campaign=?,updated_at=? WHERE id=? AND guild_id=?')
      .bind(name, content, JSON.stringify(variants), JSON.stringify(targets), campaign, now, id, guildId).run();
  } else {
    await env.DB.prepare('INSERT INTO social_templates(guild_id,name,content,content_variants_json,targets_json,campaign,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(guildId, name, content, JSON.stringify(variants), JSON.stringify(targets), campaign, actorId, now, now).run();
  }
  return json({ ok: true });
}

async function deleteTemplate(env: Env, guildId: string, body: any): Promise<Response> {
  const id = Number(body.id || 0);
  if (!id) return json({ error: 'template_not_found' }, 400);
  await env.DB.prepare('DELETE FROM social_templates WHERE id=? AND guild_id=?').bind(id, guildId).run();
  return json({ ok: true });
}

async function savePost(env: Env, guildId: string, actorId: string, body: any): Promise<Response> {
  const targets = normalizeTargets(body.targets);
  const content = String(body.content || '');
  const variants = normalizeVariants(body.variants ?? body.content_variants);
  const mediaIds = normalizeMediaIds(body.media_ids);
  const hasVariantText = Object.values(variants).some(value => value.trim());
  if ((!content.trim() && !hasVariantText && !mediaIds.length) || !targets.length) return json({ error: 'invalid_post', detail: 'Choose at least one target and enter a message, add platform-specific copy, or attach an image.' }, 400);
  if (Array.isArray(body.media_ids) && mediaIds.length !== body.media_ids.length) return json({ error: 'invalid_images', detail: `Choose up to ${MAX_SOCIAL_IMAGES} valid uploaded images.` }, 400);

  const pingRoleId = targets.includes('discord') ? String(body.ping_role_id || '') || null : null;
  if (pingRoleId) {
    const resources = await loadGuildResources(env, guildId, { roles: true });
    if (!resources.ok) return json(resources, resources.status);
    const roleFailure = validateRoleIds(resources, [pingRoleId], { mentionable: true });
    if (roleFailure) return json({ ...roleFailure, detail: 'The selected Discord ping role must exist in this server and be marked Mentionable.' }, roleFailure.status);
  }

  const rows = await env.DB.prepare('SELECT * FROM social_integrations WHERE guild_id=?').bind(guildId).all();
  const limits = await textLimitsForIntegrations(env, rows.results as any[], targets);
  for (const platform of targets) {
    const platformContent = getPlatformContent(content, variants, platform);
    const withRole = platform === 'discord' && pingRoleId ? `<@&${pingRoleId}> ${platformContent}` : platformContent;
    const limit = Number(limits[platform] || 0);
    const count = textLength(withRole);
    if (limit && count > limit) return json({ error: 'text_limit_exceeded', detail: `${platform} allows ${limit} characters; this message has ${count}.`, platform, limit, count }, 400);
  }

  let mediaRows: SocialMediaRow[] = [];
  if (mediaIds.length) {
    const placeholders = mediaIds.map(() => '?').join(',');
    const result = await env.DB.prepare(`SELECT id,guild_id,object_key,file_name,content_type,size_bytes,alt_text FROM social_media WHERE guild_id=? AND id IN (${placeholders})`).bind(guildId, ...mediaIds).all<SocialMediaRow>();
    const byId = new Map(result.results.map(row => [Number(row.id), row]));
    mediaRows = mediaIds.map(id => byId.get(id)).filter((row): row is SocialMediaRow => Boolean(row));
    if (mediaRows.length !== mediaIds.length) return json({ error: 'uploaded_image_not_found', detail: 'One of those images is no longer available. Upload it again.' }, 404);
  }

  const isDraft = body.op === 'save_draft' || body.status === 'draft' || body.draft === true;
  const now = Date.now();
  const scheduled = isDraft ? (Number(body.scheduled_for || 0) || null) : Number(body.scheduled_for || now);
  if (!isDraft && (!Number.isFinite(Number(scheduled)) || Number(scheduled) < now - 60_000)) return json({ error: 'invalid_schedule', detail: 'Choose a valid current or future time.' }, 400);
  if (mediaRows.length) {
    const retainUntil = Math.max(now + 30 * 24 * 60 * 60 * 1000, Number(scheduled || now) + 7 * 24 * 60 * 60 * 1000);
    await env.DB.batch(mediaRows.map(row => env.DB.prepare('UPDATE social_media SET expires_at=? WHERE id=? AND guild_id=?').bind(retainUntil, row.id, guildId)));
  }
  const status = isDraft ? 'draft' : Number(scheduled) <= now ? 'queued' : 'scheduled';
  const campaign = cleanCampaign(body.campaign);
  const templateId = Number(body.template_id || 0) || null;
  const id = Number(body.id || 0);
  if (id) {
    const existing = await env.DB.prepare('SELECT id,status FROM social_publish_posts WHERE id=? AND guild_id=?').bind(id, guildId).first<any>();
    if (!existing) return json({ error: 'post_not_found' }, 404);
    if (existing.status === 'sending' || existing.status === 'sent') return json({ error: 'post_not_editable', detail: 'Posts already being delivered or already sent cannot be edited.' }, 409);
    await env.DB.prepare(`UPDATE social_publish_posts SET content=?,targets_json=?,status=?,scheduled_for=?,ping_role_id=?,media_ids_json=?,content_variants_json=?,campaign=?,template_id=?,dispatch_lease_until=NULL,updated_at=? WHERE id=? AND guild_id=?`)
      .bind(content, JSON.stringify(targets), status, scheduled, pingRoleId, JSON.stringify(mediaIds), JSON.stringify(variants), campaign, templateId, now, id, guildId).run();
  } else {
    const result = await env.DB.prepare(`INSERT INTO social_publish_posts(guild_id,content,targets_json,status,scheduled_for,ping_role_id,media_ids_json,content_variants_json,campaign,template_id,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(guildId, content, JSON.stringify(targets), status, scheduled, pingRoleId, JSON.stringify(mediaIds), JSON.stringify(variants), campaign, templateId, actorId, now, now).run();
    body.id = Number(result.meta.last_row_id);
  }
  if (status === 'queued' && env.JOBS) await env.JOBS.send({ type: 'social-dispatch', socialPostId: Number(body.id) });
  return json({ ok: true, id: Number(body.id), status });
}

async function deletePost(env: Env, guildId: string, body: any): Promise<Response> {
  const id = Number(body.id || 0);
  const row = await env.DB.prepare('SELECT id,status FROM social_publish_posts WHERE id=? AND guild_id=?').bind(id, guildId).first<any>();
  if (!row) return json({ error: 'post_not_found' }, 404);
  if (row.status === 'sending') return json({ error: 'post_in_flight', detail: 'This post is currently being delivered.' }, 409);
  await env.DB.prepare('DELETE FROM social_publish_posts WHERE id=? AND guild_id=?').bind(id, guildId).run();
  return json({ ok: true });
}

async function socialAction(env: Env, guildId: string, body: any): Promise<Response> {
  const id = Number(body.id || 0);
  const row = await env.DB.prepare('SELECT id,status FROM social_publish_posts WHERE id=? AND guild_id=?').bind(id, guildId).first<any>();
  if (!row) return json({ error: 'post_not_found' }, 404);
  if (body.action === 'delete') return deletePost(env, guildId, body);
  if (body.action === 'send_now' || body.action === 'retry') {
    await env.DB.prepare("UPDATE social_publish_posts SET scheduled_for=?,status='queued',dispatch_attempts=0,dispatch_lease_until=NULL,updated_at=? WHERE id=? AND guild_id=?").bind(Date.now(), Date.now(), id, guildId).run();
    if (env.JOBS) await env.JOBS.send({ type: 'social-dispatch', socialPostId: id });
    return json({ ok: true });
  }
  return json({ error: 'invalid_action' }, 400);
}

function normalizeTargets(raw: unknown): string[] {
  return Array.isArray(raw) ? Array.from(new Set(raw.map(String).filter(value => SOCIAL_TARGETS.includes(value)))).slice(0, 4) : [];
}

function normalizeVariants(raw: unknown): Record<string, string> {
  let source: any = raw;
  if (typeof source === 'string') { try { source = JSON.parse(source); } catch { source = {}; } }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => SOCIAL_TARGETS.includes(key) && typeof value !== 'object').map(([key, value]) => [key, String(value).slice(0, 10000)]));
}

export function getPlatformContent(base: string, variants: Record<string, string>, platform: string): string {
  return Object.prototype.hasOwnProperty.call(variants, platform) ? String(variants[platform] || '') : base;
}

function normalizeMediaIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map(Number).filter(id => Number.isInteger(id) && id > 0))).slice(0, MAX_SOCIAL_IMAGES);
}

function cleanCampaign(raw: unknown): string | null {
  const value = String(raw || '').trim().replace(/[\0\r\n]/g, ' ').slice(0, 100);
  return value || null;
}
