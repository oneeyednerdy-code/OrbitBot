import type { Env } from '../types';
import { managedGuild } from '../auth/authorization';
import { getSession } from '../auth/session';
import { installUrl } from '../auth/oauth';
import { moduleCatalog } from '../modules/diagnostics/catalog';
import { handleGuildApi, listManageableGuilds } from '../modules/dashboard/api';
import { json } from './responses';
import { operatorBugApi } from '../modules/bug-reports/api';

function validMutation(request: Request, env: Env, csrf: string): boolean {
  return request.headers.get('origin') === env.APP_ORIGIN && request.headers.get('x-orby-csrf') === csrf;
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const session = await getSession(request, env);
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (request.method !== 'GET' && !validMutation(request, env, session.csrf_token)) return json({ error: 'forbidden' }, 403);

  if (url.pathname === '/api/me') { const operator=String(env.ORBIT_OPERATOR_USER_IDS||'').split(',').map(v=>v.trim()).filter(Boolean).includes(session.user_id); return json({ id: session.user_id, username: session.username, avatar: session.avatar, csrf: session.csrf_token, operator }); }
  if (url.pathname === '/api/modules') return json(moduleCatalog);
  if (url.pathname === '/api/install-url') return json({ url: installUrl(env, url.searchParams.get('guild_id')) });
  if (url.pathname === '/api/guilds') return listManageableGuilds(env, session);
  if (url.pathname === '/api/operator/bugs') return operatorBugApi(request, env, session.user_id);

  const match = url.pathname.match(/^\/api\/guilds\/(\d+)(?:\/(bootstrap|config|post-rules|create-verification|overview|diagnostics|logs|moderation|roles|tickets|scheduler|leveling|automation|community|kofi|creator|social|security|shield|creator-directory|events|applications|health|creator-safety|operations|onboarding|connections|bug-reports|start-gateway))?$/);
  if (!match) return json({ error: 'not_found' }, 404);
  const guildId = match[1];
  const action = match[2] ?? 'config';
  const authorization = await managedGuild(request, env, guildId);
  if (!authorization) return json({ error: 'forbidden' }, 403);
  return handleGuildApi(request, env, guildId, action, authorization.guild, authorization.session);
}
