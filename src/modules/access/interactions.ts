import type { Env, GuildConfigRow } from '../../types';
import { addRole } from '../../discord/client';
import { json } from '../../http/responses';
import { audit } from '../../repositories/audit';
import { verifyEd25519 } from '../../security/crypto';
import { evaluateCombinedAccess, notifyRoleChange } from './service';
import { handleRoleInteraction } from '../roles/interactions';
import { handleTicketInteraction } from '../tickets/interactions';
import { createVerificationSession } from '../verification/session';
import { handleEventInteraction } from '../events/interactions';
import { handleApplicationInteraction } from '../applications/interactions';

export async function handleInteractions(request: Request, env: Env): Promise<Response> {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const raw = await request.text();
  if (!signature || !timestamp || !(await verifyEd25519(env.DISCORD_PUBLIC_KEY, signature, timestamp + raw))) return new Response('bad signature', { status: 401 });
  const requestAge = Math.abs(Date.now() - Number(timestamp) * 1000);
  if (!Number.isFinite(requestAge) || requestAge > 5 * 60_000) return new Response('stale interaction', { status: 401 });
  let interaction: any;
  try { interaction = JSON.parse(raw); }
  catch { return new Response('invalid json', { status: 400 }); }
  if (interaction.type === 1) return json({ type: 1 });
  const applicationResponse = await handleApplicationInteraction(env, interaction);
  if (applicationResponse) return json(applicationResponse);
  const ticketResponse = await handleTicketInteraction(env, interaction);
  if (ticketResponse) return json(ticketResponse);
  const roleResponse = await handleRoleInteraction(env, interaction);
  if (roleResponse) return json(roleResponse);
  const eventResponse = await handleEventInteraction(env, interaction);
  if (eventResponse) return json(eventResponse);
  if (interaction.type === 3 && interaction.data?.custom_id === 'orby_rules_agree') {
    const config = await env.DB.prepare('SELECT * FROM guild_config WHERE guild_id=?').bind(interaction.guild_id).first<GuildConfigRow>();
    if (!config?.rules_role_id) return json({ type: 4, data: { content: 'Orbit is not configured yet.', flags: 64 } });
    const roleResponse = await addRole(env, interaction.guild_id, interaction.member.user.id, config.rules_role_id);
    if (roleResponse.ok) {
      await audit(env, interaction.guild_id, interaction.member.user.id, 'rules_role_granted', { role_id: config.rules_role_id });
      await notifyRoleChange(env, config, interaction.guild_id, interaction.member.user.id, config.rules_role_id, 'Rules', 'granted');
    }
    await evaluateCombinedAccess(env, interaction.guild_id, interaction.member.user.id);
    return json({ type: 4, data: { content: 'Rules accepted. Orbit updated your access.', flags: 64 } });
  }
  if (interaction.type === 3 && interaction.data?.custom_id === 'orby_verify_start') {
    const guildId=String(interaction.guild_id||'');
    const userId=String(interaction.member?.user?.id||'');
    if(!/^\d+$/.test(guildId)||!/^\d+$/.test(userId))return json({type:4,data:{content:'Orbit could not identify this server member.',flags:64}});
    const config=await env.DB.prepare('SELECT verified_role_id FROM guild_config WHERE guild_id=?').bind(guildId).first<GuildConfigRow>();
    if(!config?.verified_role_id)return json({type:4,data:{content:'Orbit verification is not configured for this server yet.',flags:64}});
    const url=await createVerificationSession(env,guildId,userId);
    return json({type:4,data:{content:'Your private verification link is ready. It expires in 15 minutes and can only verify your Discord account.',flags:64,components:[{type:1,components:[{type:2,style:5,label:'Continue Verification',url}]}]}});
  }
  return json({ type: 4, data: { content: 'Unknown interaction.', flags: 64 } });
}
