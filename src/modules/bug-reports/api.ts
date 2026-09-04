import type { Env } from '../../types';
import { json } from '../../http/responses';
import { diagnosticsSnapshot } from '../diagnostics/api';
import { sha256 } from '../../security/crypto';
import { ORBIT_VERSION } from '../../version';

const MAX_TEXT = 4000;

function cleanText(value: unknown, max = MAX_TEXT): string {
  return String(value ?? '')
    .replace(/(authorization|cookie|token|secret|password|client[_-]?secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .slice(0, max);
}

function cleanObject(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 30).map(v => cleanObject(v, depth + 1));
  if (!value || typeof value !== 'object') return typeof value === 'string' ? cleanText(value, 1200) : value;
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 60)) {
    if (/(token|secret|password|cookie|authorization|credential|session|webhook)/i.test(key)) output[key] = '[REDACTED]';
    else output[key] = cleanObject(raw, depth + 1);
  }
  return output;
}

async function nextBugId(env: Env): Promise<string> {
  const year = new Date().getUTCFullYear();
  for (let i = 0; i < 5; i++) {
    const suffix = String(Math.floor(100000 + Math.random() * 900000));
    const id = `ORB-${year}-${suffix}`;
    const found = await env.DB.prepare('SELECT 1 ok FROM orbit_bug_reports WHERE bug_id=?').bind(id).first();
    if (!found) return id;
  }
  return `ORB-${year}-${Date.now().toString().slice(-6)}`;
}

export async function bugReportsApi(request: Request, env: Env, guildId: string, actorId: string): Promise<Response> {
  if (request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT bug_id,area,summary,current_page,orbit_version,severity,status,created_at,updated_at
      FROM orbit_bug_reports WHERE guild_id=? ORDER BY created_at DESC LIMIT 50`).bind(guildId).all();
    return json({ reports: rows.results });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const body = await request.json<any>();
  const summary = cleanText(body.summary, 180).trim();
  if (summary.length < 4) return json({ error: 'summary_required' }, 400);
  const area = cleanText(body.area || 'general', 80);
  const description = cleanText(body.description, MAX_TEXT);
  const currentPage = cleanText(body.current_page || 'unknown', 80);
  const severity = ['low','normal','high','blocking'].includes(body.severity) ? body.severity : 'normal';
  const diagnostics = body.include_diagnostics === false ? {} : await diagnosticsSnapshot(env, guildId, actorId);
  const client = cleanObject(body.client || {});
  const fingerprint = await sha256(`${area}|${cleanText(body.error_signature || '', 500)}|${cleanText((client as any)?.errors?.[0]?.message || '', 500)}`);
  const bugId = await nextBugId(env);
  const now = Date.now();
  const result = await env.DB.prepare(`INSERT INTO orbit_bug_reports
    (bug_id,guild_id,reporter_user_id,area,summary,description,current_page,orbit_version,severity,status,diagnostic_json,client_json,fingerprint,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,'new',?,?,?,?,?)`)
    .bind(bugId,guildId,actorId,area,summary,description||null,currentPage,ORBIT_VERSION,severity,JSON.stringify(cleanObject(diagnostics)),JSON.stringify(client),fingerprint,now,now).run();
  const reportId = Number(result.meta.last_row_id || 0);
  if (reportId) await env.DB.prepare('INSERT INTO orbit_bug_events(bug_report_id,actor_user_id,event_type,note,created_at) VALUES(?,?,?,?,?)')
    .bind(reportId,actorId,'created',null,now).run();
  return json({ ok: true, bug_id: bugId, status: 'new' }, 201);
}

function operatorAllowed(env: Env, userId: string): boolean {
  return String(env.ORBIT_OPERATOR_USER_IDS || '').split(',').map(v => v.trim()).filter(Boolean).includes(userId);
}

export async function operatorBugApi(request: Request, env: Env, actorId: string): Promise<Response> {
  if (!operatorAllowed(env, actorId)) return json({ error: 'forbidden' }, 403);
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const status = url.searchParams.get('status');
    const base = `SELECT bug_id,guild_id,reporter_user_id,area,summary,description,current_page,orbit_version,severity,status,diagnostic_json,client_json,fingerprint,created_at,updated_at FROM orbit_bug_reports`;
    const rows = status && status !== 'all'
      ? await env.DB.prepare(`${base} WHERE status=? ORDER BY created_at DESC LIMIT 200`).bind(status).all()
      : await env.DB.prepare(`${base} ORDER BY created_at DESC LIMIT 200`).all();
    const grouped = await env.DB.prepare(`SELECT fingerprint,COUNT(*) count,MAX(created_at) last_seen FROM orbit_bug_reports WHERE fingerprint IS NOT NULL GROUP BY fingerprint HAVING COUNT(*)>1 ORDER BY count DESC LIMIT 30`).all();
    return json({ reports: rows.results.map((r:any)=>({...r,diagnostic_json:JSON.parse(r.diagnostic_json||'{}'),client_json:JSON.parse(r.client_json||'{}')})), duplicate_groups: grouped.results });
  }
  if (request.method === 'PATCH') {
    const body = await request.json<any>();
    const bugId = cleanText(body.bug_id, 40);
    const status = ['new','triaged','in_progress','fixed','closed','wont_fix'].includes(body.status) ? body.status : null;
    if (!bugId || !status) return json({ error: 'invalid_update' }, 400);
    const report = await env.DB.prepare('SELECT id FROM orbit_bug_reports WHERE bug_id=?').bind(bugId).first<any>();
    if (!report) return json({ error: 'not_found' }, 404);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('UPDATE orbit_bug_reports SET status=?,updated_at=? WHERE id=?').bind(status,now,report.id),
      env.DB.prepare('INSERT INTO orbit_bug_events(bug_report_id,actor_user_id,event_type,note,created_at) VALUES(?,?,?,?,?)').bind(report.id,actorId,'status_changed',cleanText(body.note,1000)||null,now),
    ]);
    return json({ ok: true, bug_id: bugId, status });
  }
  return json({ error: 'method_not_allowed' }, 405);
}
