import type { Env, SessionRow } from '../types';

function cookie(request: Request, name: string): string | null {
  return request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

export async function getSession(request: Request, env: Env): Promise<SessionRow | null> {
  const id = cookie(request, 'orby_session');
  if (!id) return null;
  return env.DB.prepare('SELECT * FROM sessions WHERE id=? AND expires_at>?').bind(id, Date.now()).first<SessionRow>();
}

export async function deleteSession(request: Request, env: Env): Promise<void> {
  const id = cookie(request, 'orby_session');
  if (id) await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(id).run();
}
