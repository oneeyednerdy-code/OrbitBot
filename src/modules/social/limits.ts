import type { Env } from '../../types';
import { fetchWithTimeout } from '../../http/fetch-timeout';
import { openSeal } from '../../security/crypto';
import { publicHttpsUrl } from '../../security/outbound-url';

export const STATIC_TEXT_LIMITS: Record<string, number> = { discord: 2000, bluesky: 300, threads: 500, mastodon: 500 };

export function textLength(value: string): number {
  return Array.from(String(value || '')).length;
}

export async function textLimitsForIntegrations(env: Env, integrations: any[], targets: string[] = Object.keys(STATIC_TEXT_LIMITS)): Promise<Record<string, number>> {
  const limits = { ...STATIC_TEXT_LIMITS };
  if (!targets.includes('mastodon') || !env.SOCIAL_CREDENTIAL_KEY) return limits;
  const integration = integrations.find(item => item.platform === 'mastodon' && Number(item.enabled) === 1);
  if (!integration?.credential_ciphertext) return limits;
  try {
    const credentials = JSON.parse(await openSeal(String(integration.credential_ciphertext), env.SOCIAL_CREDENTIAL_KEY));
    const instance = publicHttpsUrl(String(credentials.instance || ''));
    if (!instance) return limits;
    const response = await fetchWithTimeout(new URL('/api/v2/instance', instance));
    const body = await response.json<any>().catch(() => ({}));
    const max = Number(body?.configuration?.statuses?.max_characters || 0);
    if (response.ok && max > 0 && max <= 10000) limits.mastodon = max;
  } catch {}
  return limits;
}

export function validateTextTargets(content: string, targets: string[], limits: Record<string, number>): { platform: string; count: number; limit: number } | null {
  const count = textLength(content);
  for (const platform of targets) {
    const limit = Number(limits[platform] || 0);
    if (limit && count > limit) return { platform, count, limit };
  }
  return null;
}
