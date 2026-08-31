import type { Env, GuildConfigRow } from '../../types';
import { addRole } from '../../discord/client';
import { json } from '../../http/responses';
import { audit } from '../../repositories/audit';
import { verifyEd25519 } from '../../security/crypto';
import { evaluateCombinedAccess, notifyRoleChange } from './service';
import { handleRoleInteraction } from '../roles/interactions';
import { handleTicketInteraction } from '../tickets/interactions';

export async function handleInteractions(request: Request, env: Env): Promise<Response> {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const raw = await request.text();
  if (!signature || !timestamp || !(await verifyEd25519(env.DISCORD_PUBLIC_KEY, signature, timestamp + raw))) return new Response('bad signature', { status: 401 });
  const interaction = JSON.parse(raw);
  if (interaction.type === 1) return json({ type: 1 });
  const ticketResponse = await handleTicketInteraction(env, interaction);
  if (ticketResponse) return json(ticketResponse);
  const roleResponse = await handleRoleInteraction(env, interaction);
  if (roleResponse) return json(roleResponse);
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
  return json({ type: 4, data: { content: 'Unknown interaction.', flags: 64 } });
}
