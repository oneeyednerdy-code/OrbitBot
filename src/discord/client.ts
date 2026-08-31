import type { Env } from '../types';

const DISCORD_API = 'https://discord.com/api/v10';

export async function discord(env: Env, path: string, init: RequestInit = {}, userToken?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('authorization', userToken ? `Bearer ${userToken}` : `Bot ${env.DISCORD_BOT_TOKEN}`);
  if (init.body) headers.set('content-type', 'application/json');
  return fetch(`${DISCORD_API}${path}`, { ...init, headers });
}

export async function addRole(env: Env, guildId: string, userId: string, roleId: string): Promise<Response> {
  return discord(env, `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: 'PUT' });
}

export async function removeRole(env: Env, guildId: string, userId: string, roleId: string): Promise<Response> {
  return discord(env, `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: 'DELETE' });
}
