import type { Env, GuildConfigRow } from '../../types';
import { addRole, discord, removeRole } from '../../discord/client';
import { audit } from '../../repositories/audit';

export async function notifyRoleChange(env: Env, config: GuildConfigRow, guildId: string, userId: string, roleId: string, roleLabel: 'Rules' | 'Verified' | 'Combined', kind: 'granted' | 'removed'): Promise<void> {
  if (!config.admin_log_channel_id) return;
  const enabled = roleLabel === 'Rules'
    ? kind === 'granted' && config.notify_rules_granted !== 0
    : roleLabel === 'Verified'
      ? kind === 'granted' && config.notify_verified_granted !== 0
      : kind === 'granted' ? config.notify_combined_granted !== 0 : config.notify_combined_removed !== 0;
  if (!enabled) return;
  const content = kind === 'granted'
    ? `**Orbit • Access Granted**\n<@${userId}> has been granted <@&${roleId}>.`
    : `**Orbit • Access Removed**\n<@${userId}> has had <@&${roleId}> removed.`;
  try {
    const response = await discord(env, `/channels/${config.admin_log_channel_id}/messages`, { method: 'POST', body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) });
    if (!response.ok) await audit(env, guildId, userId, 'admin_notification_failed', { kind, role_id: roleId, status: response.status });
  } catch {
    await audit(env, guildId, userId, 'admin_notification_failed', { kind, role_id: roleId });
  }
}

export async function evaluateCombinedAccess(env: Env, guildId: string, userId: string): Promise<void> {
  const config = await env.DB.prepare('SELECT * FROM guild_config WHERE guild_id=?').bind(guildId).first<GuildConfigRow>();
  if (!config?.rules_role_id || !config.verified_role_id || !config.combined_role_id) return;
  const memberResponse = await discord(env, `/guilds/${guildId}/members/${userId}`);
  if (!memberResponse.ok) return;
  const member = (await memberResponse.json()) as any;
  const qualifies = member.roles.includes(config.rules_role_id) && member.roles.includes(config.verified_role_id);
  const hasCombined = member.roles.includes(config.combined_role_id);
  if (qualifies && !hasCombined) {
    const response = await addRole(env, guildId, userId, config.combined_role_id);
    if (response.ok) {
      await audit(env, guildId, userId, 'combined_role_granted', { role_id: config.combined_role_id });
      await notifyRoleChange(env, config, guildId, userId, config.combined_role_id, 'Combined', 'granted');
    }
  } else if (!qualifies && hasCombined && config.remove_combined_when_invalid) {
    const response = await removeRole(env, guildId, userId, config.combined_role_id);
    if (response.ok) {
      await audit(env, guildId, userId, 'combined_role_removed', { role_id: config.combined_role_id });
      await notifyRoleChange(env, config, guildId, userId, config.combined_role_id, 'Combined', 'removed');
    }
  }
}
