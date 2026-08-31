import type { Env } from '../../types';
import { json } from '../../http/responses';

export async function logsApi(env: Env, guildId: string): Promise<Response> {
  const [auditRows,errorRows] = await Promise.all([
    env.DB.prepare('SELECT id,action AS event_type,actor_user_id,details AS payload_json,created_at FROM audit_events WHERE guild_id=? ORDER BY created_at DESC LIMIT 200').bind(guildId).all(),
    env.DB.prepare('SELECT id,request_id,route,method,status,error_code,detail_json,created_at FROM orbit_error_log WHERE guild_id=? ORDER BY created_at DESC LIMIT 100').bind(guildId).all<any>(),
  ]);
  return json({
    events: auditRows.results,
    errors: errorRows.results.map((row:any)=>({...row,detail:parse(row.detail_json)})),
  });
}
function parse(raw:string){try{return JSON.parse(raw||'{}')}catch{return {raw:String(raw||'').slice(0,1200)}}}
