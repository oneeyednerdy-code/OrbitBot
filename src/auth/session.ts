import type { Env, SessionRow } from '../types';
import { openSeal, seal } from '../security/crypto';

function cookie(request: Request, name: string): string | null {
  return request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

export async function getSession(request: Request, env: Env): Promise<SessionRow | null> {
  const id = cookie(request, 'orby_session');
  if (!id) return null;
  const now=Date.now();
  const session=await env.DB.prepare('SELECT * FROM sessions WHERE id=? AND COALESCE(session_expires_at,expires_at)>?').bind(id,now).first<SessionRow>();
  if(!session)return null;
  if(session.expires_at>now+60_000)return session;
  if(!session.refresh_token)return null;
  try{
    const refreshToken=await openSeal(session.refresh_token,env.SESSION_SECRET);
    const body=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:'refresh_token',refresh_token:refreshToken});
    const response=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
    if(!response.ok)return null;
    const token=await response.json<any>();
    if(!token.access_token)return null;
    const accessCipher=await seal(token.access_token,env.SESSION_SECRET),refreshCipher=token.refresh_token?await seal(token.refresh_token,env.SESSION_SECRET):session.refresh_token,expiresAt=now+Number(token.expires_in||0)*1000;
    await env.DB.prepare('UPDATE sessions SET access_token=?,refresh_token=?,oauth_scope=?,token_type=?,expires_at=? WHERE id=?').bind(accessCipher,refreshCipher,String(token.scope||session.oauth_scope||''),String(token.token_type||session.token_type||'Bearer'),expiresAt,id).run();
    return {...session,access_token:accessCipher,refresh_token:refreshCipher,oauth_scope:String(token.scope||session.oauth_scope||''),token_type:String(token.token_type||session.token_type||'Bearer'),expires_at:expiresAt};
  }catch{return null;}
}

export async function deleteSession(request: Request, env: Env): Promise<void> {
  const id = cookie(request, 'orby_session');
  if (id) await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(id).run();
}
