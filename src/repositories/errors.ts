import type { Env } from '../types';

const SECRET_KEY = /(token|secret|password|cookie|authorization|credential|code_verifier|client_secret)/i;
const redactString=(value:string)=>value
  .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi,'Bearer [REDACTED]')
  .replace(/([?&](?:access_token|refresh_token|token|code|client_secret)=)[^&\s]+/gi,'$1[REDACTED]')
  .replace(/("(?:access_token|refresh_token|token|secret|password|cookie|authorization|credential|client_secret|code_verifier)"\s*:\s*")[^"]+/gi,'$1[REDACTED]');

function safe(value: any, depth = 0): any {
  if (depth > 4) return '[TRUNCATED]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactString(value).slice(0, 1200);
  if (Array.isArray(value)) return value.slice(0, 20).map(v => safe(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(value).slice(0, 30)) out[key] = SECRET_KEY.test(key) ? '[REDACTED]' : safe(val, depth + 1);
    return out;
  }
  return String(value).slice(0, 1200);
}

export async function recordSystemError(
  env: Env,
  guildId: string | null,
  route: string,
  method: string,
  status: number,
  errorCode: string,
  detail: any = {},
): Promise<string> {
  const requestId = crypto.randomUUID();
  const payload = safe(detail);
  try {
    await env.DB.prepare(`INSERT INTO orbit_error_log(guild_id,request_id,route,method,status,error_code,detail_json,created_at)
      VALUES(?,?,?,?,?,?,?,?)`)
      .bind(guildId, requestId, route.slice(0, 240), method.slice(0, 12), status, errorCode.slice(0, 120), JSON.stringify(payload), Date.now()).run();
  } catch (error) {
    console.error('orbit error log write failed', requestId, error);
  }
  console.error('orbit request failure', { requestId, guildId, route, method, status, errorCode, detail: payload });
  return requestId;
}
