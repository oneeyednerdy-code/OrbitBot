import type { Env } from './types';
import { oauthCallback, oauthStart, installRedirect } from './auth/oauth';
import { deleteSession } from './auth/session';
import { handleApi } from './http/api';
import { redirect } from './http/responses';
import { handleInteractions } from './modules/access/interactions';
import { verificationRoute } from './modules/verification/route';
import { withSecurityHeaders } from './security/headers';
import { kofiWebhook } from './modules/kofi/webhook';
import { connectionOauthStart, connectionOauthCallback } from './modules/connections/oauth';

export async function routeRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/oauth/login') return oauthStart(env);
  if (url.pathname === '/oauth/callback') return oauthCallback(request, env);
  if (url.pathname === '/oauth/install') return installRedirect(env, url.searchParams.get('guild_id'));
  const connectionStart = url.pathname.match(/^\/connections\/(twitch|youtube|threads|mastodon|tiktok|instagram)\/start$/);
  if (connectionStart) return connectionOauthStart(request, env, connectionStart[1]);
  const connectionCallback = url.pathname.match(/^\/connections\/(twitch|youtube|threads|mastodon|tiktok|instagram)\/callback$/);
  if (connectionCallback) return connectionOauthCallback(request, env, connectionCallback[1]);
  if (url.pathname === '/logout') {
    await deleteSession(request, env);
    return redirect('/', { 'set-cookie': 'orby_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0' });
  }
  if (url.pathname === '/interactions' && request.method === 'POST') return handleInteractions(request, env);
  const kofiMatch=url.pathname.match(/^\/webhooks\/kofi\/(\d+)\/([^/]+)$/);
  if(kofiMatch&&request.method==='POST') return kofiWebhook(request,env,kofiMatch[1],kofiMatch[2]);
  if (url.pathname.startsWith('/api/')) return handleApi(request, env);
  const verificationMatch = url.pathname.match(/^\/verify\/(.+)$/);
  if (verificationMatch) return verificationRoute(request, env, verificationMatch[1]);
  return withSecurityHeaders(await env.ASSETS.fetch(request));
}
