import type { Env } from '../types';

const DISCORD_API = 'https://discord.com/api/v10';
const MAX_RATE_LIMIT_WAIT_MS = 10_000;
let globalBlockedUntil = 0;
const routeBlockedUntil = new Map<string, number>();

function routeKey(path: string, method: string): string {
  const parts = path.split('/').filter(Boolean);
  const majorIndex = parts.findIndex(part => part === 'guilds' || part === 'channels' || part === 'webhooks');
  return `${method.toUpperCase()}:${parts.map((part, index) => (/^\d{16,20}$/.test(part) && index !== majorIndex + 1 ? ':id' : part)).join('/')}`;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response, body?: any): number {
  const seconds = Number(response.headers.get('retry-after') || body?.retry_after || 0);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : 0;
}

export async function discord(env: Env, path: string, init: RequestInit = {}, userToken?: string): Promise<Response> {
  const method = init.method || 'GET';
  const safeInit = withSafeMessageMentions(path, method, init);
  const headers = new Headers(safeInit.headers);
  headers.set('authorization', userToken ? `Bearer ${userToken}` : `Bot ${env.DISCORD_BOT_TOKEN}`);
  if (safeInit.body) headers.set('content-type', 'application/json');
  const key = routeKey(path, method);
  const blockedUntil = Math.max(globalBlockedUntil, routeBlockedUntil.get(key) || 0);
  const wait = blockedUntil - Date.now();
  if (wait > 0 && wait <= MAX_RATE_LIMIT_WAIT_MS) await delay(wait);

  let response = await fetch(`${DISCORD_API}${path}`, { ...safeInit, headers });
  updateBucketState(response, key);
  if (response.status !== 429) return response;

  let body: any = null;
  try { body = await response.clone().json<any>(); } catch {}
  const retryMs = retryAfterMs(response, body);
  const global = response.headers.get('x-ratelimit-global') === 'true' || body?.global === true;
  const until = Date.now() + retryMs;
  if (global) globalBlockedUntil = Math.max(globalBlockedUntil, until);
  else routeBlockedUntil.set(key, Math.max(routeBlockedUntil.get(key) || 0, until));

  if (retryMs <= 0 || retryMs > MAX_RATE_LIMIT_WAIT_MS) return response;
  await delay(retryMs + Math.floor(Math.random() * 250));
  response = await fetch(`${DISCORD_API}${path}`, { ...safeInit, headers });
  updateBucketState(response, key);
  return response;
}

function withSafeMessageMentions(path:string,method:string,init:RequestInit):RequestInit{
  if(!['POST','PATCH'].includes(method.toUpperCase())||!/\/channels\/\d+\/messages(?:\/\d+)?$/.test(path)||typeof init.body!=='string')return init;
  try{
    const payload=JSON.parse(init.body);
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.prototype.hasOwnProperty.call(payload,'allowed_mentions'))return init;
    return {...init,body:JSON.stringify({...payload,allowed_mentions:{parse:[]}})};
  }catch{return init;}
}

function updateBucketState(response: Response, key: string): void {
  if (response.headers.get('x-ratelimit-remaining') !== '0') return;
  const resetAfter = Number(response.headers.get('x-ratelimit-reset-after') || 0);
  if (Number.isFinite(resetAfter) && resetAfter > 0) routeBlockedUntil.set(key, Date.now() + Math.ceil(resetAfter * 1000));
}

export async function addRole(env: Env, guildId: string, userId: string, roleId: string): Promise<Response> {
  return discord(env, `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: 'PUT' });
}

export async function removeRole(env: Env, guildId: string, userId: string, roleId: string): Promise<Response> {
  return discord(env, `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: 'DELETE' });
}
