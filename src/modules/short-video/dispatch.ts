import type { Env } from '../../types';
import { publishShortVideo, checkShortVideoStatus } from './providers';
import { cleanupExpiredShortVideoMedia } from './media';
import { MAX_QUEUE_ATTEMPTS } from '../scheduler/retry-policy.js';

const LEASE_MS = 10 * 60_000;

export async function dispatchShortVideo(env: Env, id: number): Promise<void> {
  const now = Date.now();
  const claim = await env.DB.prepare("UPDATE short_video_posts SET status='sending',dispatch_lease_until=?,dispatch_attempts=dispatch_attempts+1,updated_at=? WHERE id=? AND dispatch_attempts<? AND (status='queued' OR (status='sending' AND COALESCE(dispatch_lease_until,0)<=?))").bind(now + LEASE_MS, now, id, MAX_QUEUE_ATTEMPTS, now).run();
  if (!claim.meta.changes) return;
  const post = await env.DB.prepare('SELECT * FROM short_video_posts WHERE id=?').bind(id).first<any>();
  if (!post || post.status === 'cancelled') return;
  const targets = parse(post.targets_json, []);
  let transient = false;
  for (const platform of targets) {
    const existing = await env.DB.prepare("SELECT status FROM short_video_runs WHERE post_id=? AND platform=?").bind(id, platform).first<any>();
    if (existing?.status === 'sent' || existing?.status === 'processing') continue;
    const connection = await env.DB.prepare("SELECT * FROM creator_account_connections WHERE guild_id=? AND platform=? AND status='connected' ORDER BY id LIMIT 1").bind(post.guild_id, platform).first<any>();
    let status = 'failed', externalId: string | null = null, error: string | null = 'platform_not_connected', httpStatus: number | null = null;
    if (connection) {
      try {
        const result = await publishShortVideo(env, connection, post);
        status = result.ok ? result.status : 'failed'; externalId = result.externalId || null; error = result.ok ? null : result.error || 'video_publish_failed'; httpStatus = result.httpStatus || null; transient ||= Boolean(result.transient);
      } catch (failure: any) { error = String(failure?.message || 'video_publish_failed').slice(0, 300); }
    }
    await env.DB.prepare(`INSERT INTO short_video_runs(post_id,guild_id,platform,status,external_id,error_code,attempted_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(post_id,platform) DO UPDATE SET status=excluded.status,external_id=excluded.external_id,error_code=excluded.error_code,attempted_at=excluded.attempted_at,updated_at=excluded.updated_at`)
      .bind(id, post.guild_id, platform, status, externalId, error, now, Date.now()).run();
    if (httpStatus === 429 || Number(httpStatus) >= 500) transient = true;
  }
  await recomputePost(env, id);
  const attempts = Number(post.dispatch_attempts || 1);
  if (transient && attempts < MAX_QUEUE_ATTEMPTS) {
    await env.DB.prepare("UPDATE short_video_posts SET status='queued',dispatch_lease_until=NULL,updated_at=? WHERE id=?").bind(Date.now(), id).run();
    throw new Error('short_video_transient_failure');
  }
  await env.DB.prepare('UPDATE short_video_posts SET dispatch_lease_until=NULL,updated_at=? WHERE id=?').bind(Date.now(), id).run();
}

export async function shortVideoSweep(env: Env): Promise<void> {
  const now = Date.now();
  await cleanupExpiredShortVideoMedia(env);
  const processing = await env.DB.prepare(`SELECT r.id AS run_id,r.post_id,r.platform,r.external_id,p.*,c.*
    FROM short_video_runs r JOIN short_video_posts p ON p.id=r.post_id
    JOIN creator_account_connections c ON c.guild_id=p.guild_id AND c.platform=r.platform AND c.status='connected'
    WHERE r.status='processing' AND COALESCE(r.updated_at,0)<=? ORDER BY r.updated_at ASC LIMIT 20`).bind(now - 20_000).all<any>();
  for (const row of processing.results) {
    try {
      const result = await checkShortVideoStatus(env, row, row, String(row.external_id));
      await env.DB.prepare('UPDATE short_video_runs SET status=?,external_id=?,error_code=?,updated_at=? WHERE id=?').bind(result.status, result.externalId || row.external_id, result.error || null, Date.now(), row.run_id).run();
    } catch (error: any) {
      await env.DB.prepare('UPDATE short_video_runs SET error_code=?,updated_at=? WHERE id=?').bind(String(error?.message || 'video_status_check_failed').slice(0, 300), Date.now(), row.run_id).run();
    }
    await recomputePost(env, Number(row.post_id));
  }
  if (!env.JOBS) return;
  const due = await env.DB.prepare("SELECT id,status FROM short_video_posts WHERE dispatch_attempts<? AND ((status='scheduled' AND scheduled_for<=?) OR status='queued' OR (status='sending' AND COALESCE(dispatch_lease_until,0)<=?)) ORDER BY scheduled_for ASC LIMIT 20").bind(MAX_QUEUE_ATTEMPTS, now, now).all<any>();
  for (const row of due.results) {
    if (row.status === 'scheduled') await env.DB.prepare("UPDATE short_video_posts SET status='queued',updated_at=? WHERE id=? AND status='scheduled'").bind(now, row.id).run();
    await env.JOBS.send({ type: 'short-video-dispatch', shortVideoPostId: row.id });
  }
}

async function recomputePost(env: Env, id: number): Promise<void> {
  const post = await env.DB.prepare('SELECT targets_json FROM short_video_posts WHERE id=?').bind(id).first<any>();
  if (!post) return;
  const targets = parse(post.targets_json, []);
  const runs = await env.DB.prepare('SELECT status FROM short_video_runs WHERE post_id=?').bind(id).all<any>();
  const statuses = runs.results.map((row: any) => String(row.status));
  let status = 'sending';
  if (statuses.length >= targets.length && statuses.every((value: string) => value === 'sent')) status = 'sent';
  else if (statuses.some((value: string) => value === 'processing')) status = 'processing';
  else if (statuses.some((value: string) => value === 'sent') && statuses.some((value: string) => value === 'failed')) status = 'partial';
  else if (statuses.length >= targets.length && statuses.every((value: string) => value === 'failed')) status = 'failed';
  await env.DB.prepare('UPDATE short_video_posts SET status=?,last_error=?,updated_at=? WHERE id=?').bind(status, statuses.some((value: string) => value === 'failed') ? 'One or more video destinations failed.' : null, Date.now(), id).run();
}

function parse(raw: any, fallback: any): any { try { return typeof raw === 'string' ? JSON.parse(raw) : raw ?? fallback; } catch { return fallback; } }
