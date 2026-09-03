import type { Env } from '../../types';
import { json } from '../../http/responses';

export async function logsApi(env: Env, guildId: string): Promise<Response> {
  const auditRows = await env.DB.prepare('SELECT id,action AS event_type,actor_user_id,details AS payload_json,created_at FROM audit_events WHERE guild_id=? ORDER BY created_at DESC LIMIT 200').bind(guildId).all();
  let errors: any[] = [];
  const warnings: any[] = [];
  try {
    errors = (await env.DB.prepare('SELECT id,request_id,route,method,status,error_code,detail_json,created_at FROM orbit_error_log WHERE guild_id=? ORDER BY created_at DESC LIMIT 100').bind(guildId).all<any>()).results;
  } catch (error: any) {
    if (!missingErrorLogTable(error)) throw error;
    warnings.push({
      code: 'migration_0029_required',
      detail: 'Verbose error history is unavailable because D1 migration 0029_social_auth_verbose_errors.sql has not been applied. Run npm run db:remote, then reload this page.',
    });
  }
  return json({
    events: auditRows.results,
    errors: errors.map((row:any)=>({...row,detail:parse(row.detail_json),recency:Number(row.created_at)>=Date.now()-60*60_000?'recent':'history'})),
    warnings,
  });
}
function parse(raw:string){try{return JSON.parse(raw||'{}')}catch{return {raw:String(raw||'').slice(0,1200)}}}
function missingErrorLogTable(error:any){return /no such table:\s*orbit_error_log/i.test(String(error?.message||error||''))}
