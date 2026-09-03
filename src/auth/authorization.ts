import type { Env, SessionRow } from '../types';
import { openSeal } from '../security/crypto';
import { discord } from '../discord/client';
import { canManageGuild } from '../discord/permissions';
import { getSession } from './session';

export type ManagedGuildResult =
  | { ok: true; session: SessionRow; guild: any }
  | { ok: false; status: number; error: string; detail?: string; retry_after?: number };

const guildCache=new Map<string,{expiresAt:number;guilds:any[]}>();
const GUILD_CACHE_MS=15_000;

function userCanManageGuild(guild: any): boolean {
  if (guild?.owner === true) return true;
  try { return canManageGuild(String(guild?.permissions ?? '0')); } catch { return false; }
}

export async function managedGuild(request: Request, env: Env, guildId: string, knownSession?: SessionRow): Promise<ManagedGuildResult> {
  const session = knownSession ?? await getSession(request, env);
  if (!session) return { ok: false, status: 401, error: 'unauthorized', detail: 'Your Orbit session is missing or expired.' };

  let token: string;
  try { token = await openSeal(session.access_token, env.SESSION_SECRET); }
  catch { return { ok: false, status: 401, error: 'discord_reauth_required', detail: 'Orbit could not open your Discord authorization. Reconnect Discord.' }; }

  const cached=guildCache.get(session.id);
  if(cached&&cached.expiresAt>Date.now())return authorizeFromList(session,guildId,cached.guilds);
  const response = await discord(env, '/users/@me/guilds', {}, token);
  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: 401, error: 'discord_reauth_required', detail: 'Discord no longer accepts this dashboard authorization. Reconnect Discord.' };
  }
  if (response.status === 429) {
    let retryAfter = 1;
    try { const body = await response.clone().json<any>(); retryAfter = Math.max(1, Number(body?.retry_after || 1)); } catch {}
    return { ok: false, status: 429, error: 'discord_rate_limited', detail: 'Discord temporarily rate-limited the server authorization check.', retry_after: retryAfter };
  }
  if (!response.ok) {
    return { ok: false, status: 502, error: 'discord_authorization_failed', detail: `Discord authorization lookup returned HTTP ${response.status}.` };
  }

  const guilds = (await response.json()) as any[];
  guildCache.set(session.id,{expiresAt:Date.now()+GUILD_CACHE_MS,guilds});
  if(guildCache.size>500)for(const [key,value] of guildCache)if(value.expiresAt<=Date.now())guildCache.delete(key);
  return authorizeFromList(session,guildId,guilds);
}

function authorizeFromList(session:SessionRow,guildId:string,guilds:any[]):ManagedGuildResult{
  const guild = guilds.find(item => item.id === guildId);
  if (!guild) return { ok: false, status: 403, error: 'guild_not_available', detail: 'This server is not available to the connected Discord account.' };
  if (!userCanManageGuild(guild)) return { ok: false, status: 403, error: 'missing_manage_server_permission', detail: 'You must own this server or have Manage Server permission to configure Orbit.' };
  return { ok: true, session, guild };
}
