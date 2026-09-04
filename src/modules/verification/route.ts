import type { Env, GuildConfigRow } from '../../types';
import { addRole } from '../../discord/client';
import { audit } from '../../repositories/audit';
import { securityHeaders } from '../../security/headers';
import { sha256 } from '../../security/crypto';
import { evaluateCombinedAccess, notifyRoleChange } from '../access/service';
import { fetchWithTimeout } from '../../http/fetch-timeout';

export async function verificationRoute(request: Request, env: Env, token: string): Promise<Response> {
  const hash = await sha256(token);
  const verification = await env.DB.prepare('SELECT * FROM verification_sessions WHERE token_hash=? AND completed_at IS NULL AND expires_at>?').bind(hash, Date.now()).first<any>();
  if (!verification) return new Response('Verification link is invalid or expired.', { status: 400, headers: securityHeaders() });
  if (request.method === 'GET') return verificationPage(env);

  const form = await request.formData();
  const turnstileResponse = form.get('cf-turnstile-response');
  const siteverify = await fetchWithTimeout('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: String(turnstileResponse ?? '') }),
  });
  const result = (await siteverify.json()) as any;
  const allowedHosts = new Set((env.TURNSTILE_HOSTNAMES || '').split(',').map(value => value.trim()).filter(Boolean));
  if (!result.success || result.action !== 'discord_verify' || allowedHosts.size === 0 || !allowedHosts.has(result.hostname)) {
    return new Response('Verification failed. Please try again.', { status: 400, headers: securityHeaders() });
  }

  const config = await env.DB.prepare('SELECT * FROM guild_config WHERE guild_id=?').bind(verification.guild_id).first<GuildConfigRow>();
  if (!config?.verified_role_id) return new Response('Server verification is not configured.', { status: 409, headers: securityHeaders() });
  const roleResponse = await addRole(env, verification.guild_id, verification.user_id, config.verified_role_id);
  if (!roleResponse.ok) return new Response('Orbit could not assign the verification role. Ask a server administrator to run Diagnostics.', { status: 409, headers: securityHeaders() });

  await audit(env, verification.guild_id, verification.user_id, 'verified_role_granted', { role_id: config.verified_role_id });
  await notifyRoleChange(env, config, verification.guild_id, verification.user_id, config.verified_role_id, 'Verified', 'granted');
  await evaluateCombinedAccess(env, verification.guild_id, verification.user_id);
  await env.DB.prepare('UPDATE verification_sessions SET completed_at=? WHERE token_hash=?').bind(Date.now(), hash).run();
  return new Response('Verified! You can return to Discord.', { headers: securityHeaders() });
}

function verificationPage(env: Env): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orbit Verification</title><link rel="stylesheet" href="/css/verify.css"><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></head><body><main class="verify-card"><div class="maker">NERDSPACE LABS</div><h1>ORBIT</h1><p>Complete the human verification to unlock your server access.</p><form method="post"><div class="cf-turnstile" data-sitekey="${env.TURNSTILE_SITE_KEY}" data-action="discord_verify"></div><button type="submit">Verify</button></form></main></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', ...securityHeaders() } });
}
