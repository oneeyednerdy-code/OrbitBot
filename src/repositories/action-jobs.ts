import type { Env } from '../types';

export type ActionStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'blocked';

export async function createActionJob(
  env: Env,
  input: { guildId: string; module: string; action: string; actorUserId?: string | null; request?: unknown },
): Promise<number> {
  const now = Date.now();
  const result = await env.DB.prepare(`INSERT INTO orbit_action_jobs
    (guild_id,module,action,status,actor_user_id,request_json,progress_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?, ?,?)`)
    .bind(input.guildId, input.module, input.action, 'queued', input.actorUserId || null, JSON.stringify(input.request ?? {}), '{}', now, now).run();
  const id = Number(result.meta.last_row_id);
  await appendActionEvent(env, id, input.guildId, 'queued', { module: input.module, action: input.action });
  return id;
}

export async function updateActionJob(
  env: Env,
  actionJobId: number | null | undefined,
  update: { status?: ActionStatus; progress?: unknown; errorCode?: string | null; requestId?: string | null; attemptCount?: number; started?: boolean; finished?: boolean },
): Promise<void> {
  if (!actionJobId) return;
  const current = await env.DB.prepare('SELECT guild_id,status FROM orbit_action_jobs WHERE id=?').bind(actionJobId).first<any>();
  if (!current) return;
  const now = Date.now();
  const status = update.status || current.status;
  const sets = ['status=?', 'progress_json=COALESCE(?,progress_json)', 'error_code=?', 'last_request_id=COALESCE(?,last_request_id)', 'updated_at=?'];
  const values: any[] = [status, update.progress === undefined ? null : JSON.stringify(update.progress), update.errorCode === undefined ? null : update.errorCode, update.requestId || null, now];
  if (update.attemptCount !== undefined) { sets.push('attempt_count=?'); values.push(update.attemptCount); }
  if (update.started) { sets.push('started_at=COALESCE(started_at,?)'); values.push(now); }
  if (update.finished) { sets.push('finished_at=?'); values.push(now); }
  values.push(actionJobId);
  await env.DB.prepare(`UPDATE orbit_action_jobs SET ${sets.join(',')} WHERE id=?`).bind(...values).run();
  if (update.status || update.progress !== undefined || update.errorCode) await appendActionEvent(env, actionJobId, String(current.guild_id), update.status || 'progress', { status, progress: update.progress ?? null, error_code: update.errorCode || null, request_id: update.requestId || null });
}

export async function appendActionEvent(env: Env, actionJobId: number, guildId: string, eventType: string, detail: unknown = {}): Promise<void> {
  await env.DB.prepare('INSERT INTO orbit_action_events(action_job_id,guild_id,event_type,detail_json,created_at) VALUES(?,?,?,?,?)')
    .bind(actionJobId, guildId, eventType.slice(0, 80), JSON.stringify(detail ?? {}), Date.now()).run();
}

export async function listActionJobs(env: Env, guildId: string, limit = 30): Promise<any[]> {
  const rows = await env.DB.prepare(`SELECT id,module,action,status,actor_user_id,progress_json,error_code,last_request_id,attempt_count,created_at,started_at,finished_at,updated_at
    FROM orbit_action_jobs WHERE guild_id=? ORDER BY created_at DESC LIMIT ?`).bind(guildId, Math.min(100, Math.max(1, limit))).all<any>();
  return rows.results.map(row => ({ ...row, progress: parse(row.progress_json) }));
}

export async function recordResourceBinding(env: Env, input: { guildId: string; resourceType: 'channel' | 'role'; resourceId: string; module: string; bindingKey: string; label: string; status: 'active' | 'missing'; error?: string | null; expected?: unknown }): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO orbit_resource_bindings(guild_id,resource_type,resource_id,module,binding_key,label,status,expected_json,last_seen_at,last_error,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(guild_id,resource_type,module,binding_key) DO UPDATE SET resource_id=excluded.resource_id,label=excluded.label,status=excluded.status,expected_json=excluded.expected_json,last_seen_at=excluded.last_seen_at,last_error=excluded.last_error,updated_at=excluded.updated_at`)
    .bind(input.guildId, input.resourceType, input.resourceId, input.module, input.bindingKey, input.label, input.status, JSON.stringify(input.expected ?? {}), input.status === 'active' ? now : null, input.error || null, now, now).run();
}

function parse(raw: unknown): any { try { return JSON.parse(String(raw || '{}')); } catch { return {}; } }
