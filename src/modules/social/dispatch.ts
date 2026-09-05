import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { publishExternal } from './adapters';
import { sendDiscordMessageWithAttachments } from '../../discord/messages';
import { isGuildMessageChannel } from '../../discord/guild-resources';
import { loadSocialMediaAssets, type SocialMediaAsset, type SocialMediaRow } from './media';
import { getPlatformContent } from './api';
import { MAX_QUEUE_ATTEMPTS } from '../scheduler/retry-policy.js';

const SOCIAL_LEASE_MS = 5 * 60_000;
const MAX_SOCIAL_ATTEMPTS = MAX_QUEUE_ATTEMPTS;

export async function dispatchSocialPost(env: Env, id: number): Promise<void> {
  const now = Date.now();
  const claim = await env.DB.prepare("UPDATE social_publish_posts SET status='sending',dispatch_lease_until=?,dispatch_attempts=dispatch_attempts+1,updated_at=? WHERE id=? AND dispatch_attempts<? AND (status='queued' OR (status='sending' AND COALESCE(dispatch_lease_until,0)<=?))").bind(now + SOCIAL_LEASE_MS, now, id, MAX_SOCIAL_ATTEMPTS, now).run();
  if (!claim.meta.changes) return;
  const post = await env.DB.prepare('SELECT * FROM social_publish_posts WHERE id=?').bind(id).first<any>();
  if (!post) return;
  const security = await env.DB.prepare('SELECT lockdown_active FROM security_configs WHERE guild_id=?').bind(post.guild_id).first<any>();
  if (security?.lockdown_active) { await env.DB.prepare("UPDATE social_publish_posts SET status='queued',dispatch_lease_until=NULL,updated_at=? WHERE id=?").bind(Date.now(), id).run(); return; }

  const targets = parse(post.targets_json, []);
  const variants = parse(post.content_variants_json, {});
  const mediaIds = parseIds(post.media_ids_json);
  const mediaRows = await loadMediaRows(env, String(post.guild_id), mediaIds);
  let media: SocialMediaAsset[] = [];
  let mediaError: string | null = mediaRows.length !== mediaIds.length ? 'social_media_not_found' : null;
  try { if (!mediaError) media = await loadSocialMediaAssets(env, mediaRows); } catch (error) { mediaError = error instanceof Error ? error.message : 'social_media_unavailable'; }
  const roleId = String(post.ping_role_id || '') || null;
  let all = true, transientFailure = false, sentCount = 0;
  for (const platform of targets) {
    const previous = await env.DB.prepare("SELECT external_id FROM social_publish_runs WHERE post_id=? AND platform=? AND status='sent' ORDER BY attempted_at DESC LIMIT 1").bind(id, platform).first<any>();
    if (previous) continue;
    let status = 'unsupported', externalId: string | null = null, error: string | null = 'adapter_not_configured';
    if (mediaError) {
      status = 'failed'; error = mediaError;
    } else if (platform === 'discord') {
      const integration = await env.DB.prepare("SELECT discord_channel_id FROM social_integrations WHERE guild_id=? AND platform='discord' AND enabled=1 LIMIT 1").bind(post.guild_id).first<any>();
      if (integration?.discord_channel_id && await isGuildMessageChannel(env, String(post.guild_id), String(integration.discord_channel_id))) {
        const roleFailure = roleId ? await validatePingRole(env, String(post.guild_id), roleId) : null;
        if (roleFailure) { error = roleFailure; transientFailure ||= roleFailure.startsWith('role_validation_'); }
        else {
          const nonce = `orb-social-${id}`.slice(0, 25);
          const content = `${roleId ? `<@&${roleId}> ` : ''}${getPlatformContent(String(post.content || ''), variants, 'discord')}`.slice(0, 2000);
          const response = await sendDiscordMessageWithAttachments(env, String(integration.discord_channel_id), { content, pingRoleIds: roleId ? [roleId] : [], nonce, enforce_nonce: true }, media.map(asset => ({ filename: asset.file_name, contentType: asset.content_type, data: asset.data })));
          status = response.ok ? 'sent' : 'failed'; error = response.ok ? null : String(response.status); transientFailure ||= response.status === 429 || response.status >= 500; if (response.ok) externalId = String((await response.clone().json<any>()).id || '') || null;
        }
      }
    } else {
      const integration = await env.DB.prepare('SELECT * FROM social_integrations WHERE guild_id=? AND platform=? AND enabled=1 ORDER BY id LIMIT 1').bind(post.guild_id, platform).first<any>();
      if (integration) { const response = await publishExternal(env, integration, getPlatformContent(String(post.content || ''), variants, platform), `orbit-social-${id}-${platform}`, media); status = response.ok ? 'sent' : 'failed'; externalId = response.externalId || null; error = response.error || null; transientFailure ||= Boolean(response.transient); }
    }
    if (status !== 'sent') all = false; else sentCount++;
    await env.DB.prepare('INSERT INTO social_publish_runs(post_id,guild_id,platform,status,external_id,error_code,attempted_at) VALUES(?,?,?,?,?,?,?)').bind(id, post.guild_id, platform, status, externalId, error, Date.now()).run();
  }
  const attempts = Number(post.dispatch_attempts || 1);
  if (!all && transientFailure && attempts < MAX_SOCIAL_ATTEMPTS) { await env.DB.prepare("UPDATE social_publish_posts SET status='queued',dispatch_lease_until=NULL,updated_at=? WHERE id=?").bind(Date.now(), id).run(); throw new Error('social_transient_failure'); }
  await env.DB.prepare('UPDATE social_publish_posts SET status=?,dispatch_lease_until=NULL,updated_at=? WHERE id=?').bind(all ? 'sent' : sentCount ? 'partial' : 'failed', Date.now(), id).run();
}

export async function socialSweep(env: Env): Promise<void> {
  if (!env.JOBS) return;
  const now = Date.now();
  const due = await env.DB.prepare("SELECT id,status FROM social_publish_posts WHERE dispatch_attempts<? AND ((status='scheduled' AND scheduled_for<=?) OR status='queued' OR (status='sending' AND COALESCE(dispatch_lease_until,0)<=?)) ORDER BY scheduled_for LIMIT 50").bind(MAX_SOCIAL_ATTEMPTS, now, now).all<any>();
  for (const row of due.results) { if (row.status === 'scheduled') await env.DB.prepare("UPDATE social_publish_posts SET status='queued',updated_at=? WHERE id=? AND status='scheduled'").bind(now, row.id).run(); await env.JOBS.send({ type: 'social-dispatch', socialPostId: row.id }); }
}

async function validatePingRole(env: Env, guildId: string, roleId: string): Promise<string | null> {
  const response = await discord(env, `/guilds/${guildId}/roles`);
  if (!response.ok) return response.status === 429 || response.status >= 500 ? `role_validation_${response.status}` : 'role_validation_failed';
  const roles = await response.json<any[]>();
  return roles.some(role => String(role.id) === roleId && !role.managed && role.mentionable) ? null : 'role_unavailable';
}

async function loadMediaRows(env: Env, guildId: string, ids: number[]): Promise<SocialMediaRow[]> {
  if (!ids.length) return [];
  const result = await env.DB.prepare(`SELECT id,guild_id,object_key,file_name,content_type,size_bytes,alt_text FROM social_media WHERE guild_id=? AND id IN (${ids.map(() => '?').join(',')})`).bind(guildId, ...ids).all<SocialMediaRow>();
  const byId = new Map(result.results.map(row => [Number(row.id), row]));
  return ids.map(id => byId.get(id)).filter((row): row is SocialMediaRow => Boolean(row));
}

function parseIds(raw: any): number[] { try { const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(parsed) ? parsed.map(Number).filter(id => Number.isInteger(id) && id > 0).slice(0, 4) : []; } catch { return []; } }
function parse(raw: any, fallback: any): any { try { return typeof raw === 'string' ? JSON.parse(raw) : raw ?? fallback; } catch { return fallback; } }
