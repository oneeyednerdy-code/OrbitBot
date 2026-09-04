import type { Env } from '../types';
import { fetchWithTimeout } from '../http/fetch-timeout';

const DISCORD_API = 'https://discord.com/api/v10';
const MAX_RATE_LIMIT_WAIT_MS = 10_000;
const DISCORD_REQUEST_TIMEOUT_MS = 15_000;
let globalBlockedUntil = 0;
const routeBlockedUntil = new Map<string, number>();
const bucketStates = new Map<string, { bucket_key: string; route: string; scope: string | null; remaining: number | null; reset_at: number | null; observed_at: number }>();

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

  let response = await fetchWithTimeout(`${DISCORD_API}${path}`, { ...safeInit, headers },DISCORD_REQUEST_TIMEOUT_MS);
  updateBucketState(response, key);
  await persistRateLimitObservation(env, key, response);
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
  response = await fetchWithTimeout(`${DISCORD_API}${path}`, { ...safeInit, headers },DISCORD_REQUEST_TIMEOUT_MS);
  updateBucketState(response, key);
  await persistRateLimitObservation(env, key, response);
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
  const now = Date.now();
  const remainingHeader = response.headers.get('x-ratelimit-remaining');
  const remaining = remainingHeader == null ? null : Number(remainingHeader);
  const resetAfter = Number(response.headers.get('x-ratelimit-reset-after') || 0);
  const resetEpoch = Number(response.headers.get('x-ratelimit-reset') || 0);
  const resetAt = Number.isFinite(resetAfter) && resetAfter > 0
    ? now + Math.ceil(resetAfter * 1000)
    : Number.isFinite(resetEpoch) && resetEpoch > 0 ? Math.ceil(resetEpoch * 1000) : null;
  const bucketKey = response.headers.get('x-ratelimit-bucket') || key;
  bucketStates.set(bucketKey, {
    bucket_key: bucketKey,
    route: key,
    scope: response.headers.get('x-ratelimit-scope'),
    remaining: Number.isFinite(remaining as number) ? remaining : null,
    reset_at: resetAt,
    observed_at: now,
  });
  if (remaining === 0 && resetAt) routeBlockedUntil.set(key, resetAt);
}

async function persistRateLimitObservation(env: Env, key: string, response: Response): Promise<void> {
  const remaining = response.headers.get('x-ratelimit-remaining');
  if (response.status !== 429 && remaining !== '0') return;
  const bucketKey = response.headers.get('x-ratelimit-bucket') || key;
  const state = bucketStates.get(bucketKey);
  try {
    await env.DB.prepare(`INSERT INTO orbit_rate_limit_buckets(bucket_key,scope,route,remaining,reset_at,observed_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(bucket_key) DO UPDATE SET scope=excluded.scope,route=excluded.route,remaining=excluded.remaining,reset_at=excluded.reset_at,observed_at=excluded.observed_at`)
      .bind(bucketKey, state?.scope || null, key, state?.remaining ?? null, state?.reset_at ?? null, state?.observed_at || Date.now()).run();
  } catch {
    // The table is introduced by a migration; rate-limit handling remains usable during rollout.
  }
}

export function getDiscordRateLimitStatus() {
  const now = Date.now();
  return {
    global_blocked_until: globalBlockedUntil > now ? globalBlockedUntil : null,
    buckets: [...bucketStates.values()]
      .filter(state => !state.reset_at || state.reset_at > now - 15 * 60_000)
      .sort((a, b) => b.observed_at - a.observed_at)
      .slice(0, 50),
  };
}

export async function addRole(env: Env, guildId: string, userId: string, roleId: string): Promise<Response> {
  return discord(env, `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: 'PUT' });
}

export async function removeRole(env: Env, guildId: string, userId: string, roleId: string): Promise<Response> {
  return discord(env, `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: 'DELETE' });
}
