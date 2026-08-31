import type { Env } from '../../types';
import { json } from '../../http/responses';

export const FEATURE_KEYS = [
  'protection','alerts','tickets','roles','scheduler','leveling','kofi','automation','social','creator_community'
] as const;

export async function onboardingApi(request: Request, env: Env, guildId: string, actorId: string): Promise<Response> {
  if (request.method === 'GET') {
    const [profile, features] = await Promise.all([
      env.DB.prepare('SELECT community_type,completed_at,updated_at FROM guild_onboarding WHERE guild_id=?').bind(guildId).first(),
      env.DB.prepare('SELECT feature_key,enabled FROM guild_features WHERE guild_id=?').bind(guildId).all(),
    ]);
    return json({ profile: profile ?? null, features: features.results });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const body = await request.json<any>();
  const existing = await env.DB.prepare('SELECT community_type FROM guild_onboarding WHERE guild_id=?').bind(guildId).first<any>();
  const requestedType = String(body.community_type || '');
  const communityType = ['creator','general','ttrpg','support','events','custom'].includes(requestedType)
    ? requestedType
    : String(existing?.community_type || 'custom');
  const selected = Array.isArray(body.features) ? body.features.filter((x: any) => FEATURE_KEYS.includes(x)).slice(0, FEATURE_KEYS.length) : [];
  const now = Date.now();
  const batch: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT INTO guild_onboarding(guild_id,community_type,completed_at,updated_by,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(guild_id) DO UPDATE SET community_type=excluded.community_type,completed_at=excluded.completed_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(guildId, communityType, now, actorId, now),
  ];
  for (const key of FEATURE_KEYS) {
    batch.push(env.DB.prepare(`INSERT INTO guild_features(guild_id,feature_key,enabled,updated_by,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(guild_id,feature_key) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(guildId, key, selected.includes(key) ? 1 : 0, actorId, now));
  }
  await env.DB.batch(batch);
  return json({ ok: true, community_type: communityType, features: selected });
}
