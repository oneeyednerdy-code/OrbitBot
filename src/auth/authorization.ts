import type { Env, SessionRow } from '../types';
import { openSeal } from '../security/crypto';
import { discord } from '../discord/client';
import { canManageGuild } from '../discord/permissions';
import { getSession } from './session';

export async function managedGuild(request: Request, env: Env, guildId: string): Promise<{ session: SessionRow; guild: any } | null> {
  const session = await getSession(request, env);
  if (!session) return null;
  let token: string;
  try { token = await openSeal(session.access_token, env.SESSION_SECRET); } catch { return null; }
  const response = await discord(env, '/users/@me/guilds', {}, token);
  if (!response.ok) return null;
  const guild = ((await response.json()) as any[]).find(item => item.id === guildId);
  return guild && canManageGuild(guild.permissions) ? { session, guild } : null;
}
