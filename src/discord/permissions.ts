export const MANAGE_GUILD = 0x20n;
export const ADMINISTRATOR = 0x8n;

export const PERMISSION_BITS = {
  kick_members: 1n << 1n,
  ban_members: 1n << 2n,
  manage_channels: 1n << 4n,
  view_channel: 1n << 10n,
  send_messages: 1n << 11n,
  manage_messages: 1n << 13n,
  embed_links: 1n << 14n,
  attach_files: 1n << 15n,
  read_message_history: 1n << 16n,
  manage_roles: 1n << 28n,
  manage_threads: 1n << 34n,
  send_messages_in_threads: 1n << 38n,
  create_events: 1n << 44n,
} as const;

export const PERMISSION_LABELS: Record<keyof typeof PERMISSION_BITS, string> = {
  kick_members: 'Kick Members',
  ban_members: 'Ban Members',
  manage_channels: 'Manage Channels',
  view_channel: 'View Channels',
  send_messages: 'Send Messages',
  manage_messages: 'Manage Messages',
  embed_links: 'Embed Links',
  attach_files: 'Attach Files',
  read_message_history: 'Read Message History',
  manage_roles: 'Manage Roles',
  manage_threads: 'Manage Threads',
  send_messages_in_threads: 'Send Messages in Threads',
  create_events: 'Create Events',
};

export function canManageGuild(permissions: string): boolean {
  const value = BigInt(permissions);
  return (value & MANAGE_GUILD) !== 0n || (value & ADMINISTRATOR) !== 0n;
}

type Role = { id: string; permissions?: string; position?: number; name?: string; managed?: boolean };
type Member = { roles?: string[]; user?: { id?: string } };
type Overwrite = { id?: string; type?: number; allow?: string; deny?: string };

export function effectivePermissions(guildId: string, roles: Role[], member: Member, channel?: { permission_overwrites?: Overwrite[] } | null): bigint {
  const roleIds = new Set((member.roles || []).map(String));
  let permissions = 0n;
  for (const role of roles) {
    if (String(role.id) === String(guildId) || roleIds.has(String(role.id))) permissions |= BigInt(role.permissions || '0');
  }
  if ((permissions & ADMINISTRATOR) !== 0n) return ~0n;
  if (!channel?.permission_overwrites?.length) return permissions;

  const overwrites = channel.permission_overwrites;
  const everyone = overwrites.find(overwrite => String(overwrite.id) === String(guildId));
  permissions = applyOverwrite(permissions, everyone);
  const roleOverwrites = overwrites.filter(overwrite => Number(overwrite.type ?? 0) === 0 && roleIds.has(String(overwrite.id)));
  if (roleOverwrites.length) {
    let deny = 0n;
    let allow = 0n;
    for (const overwrite of roleOverwrites) {
      deny |= BigInt(overwrite.deny || '0');
      allow |= BigInt(overwrite.allow || '0');
    }
    permissions = (permissions & ~deny) | allow;
  }
  const memberId = String(member.user?.id || '');
  const memberOverwrite = overwrites.find(overwrite => Number(overwrite.type ?? 1) === 1 && String(overwrite.id) === memberId);
  return applyOverwrite(permissions, memberOverwrite);
}

function applyOverwrite(base: bigint, overwrite?: Overwrite): bigint {
  if (!overwrite) return base;
  const deny = BigInt(overwrite.deny || '0');
  const allow = BigInt(overwrite.allow || '0');
  return (base & ~deny) | allow;
}

export function botTopRolePosition(roles: Role[], botMember: Member): number {
  const roleIds = new Set((botMember.roles || []).map(String));
  return Math.max(0, ...roles.filter(role => roleIds.has(String(role.id))).map(role => Number(role.position || 0)));
}

export function permissionDoctor(input: {
  guildId: string;
  roles: Role[];
  botMember: Member;
  channel?: { id?: string; name?: string; permission_overwrites?: Overwrite[] } | null;
  requiredPermissions?: Array<keyof typeof PERMISSION_BITS>;
  targetRoleIds?: string[];
}) {
  const required: Array<keyof typeof PERMISSION_BITS> = input.requiredPermissions?.length ? input.requiredPermissions : ['view_channel', 'send_messages'];
  const guildPermissions = effectivePermissions(input.guildId, input.roles, input.botMember);
  const channelPermissions = input.channel ? effectivePermissions(input.guildId, input.roles, input.botMember, input.channel) : guildPermissions;
  const checks = required.map(permission => {
    const bit = PERMISSION_BITS[permission];
    const ok = (channelPermissions & bit) !== 0n || (guildPermissions & ADMINISTRATOR) !== 0n;
    return { code: permission, label: PERMISSION_LABELS[permission], ok, detail: ok ? 'Orbit can perform this operation.' : `Orbit is missing ${PERMISSION_LABELS[permission]}${input.channel ? ' in this channel' : ''}.` };
  });
  const topPosition = botTopRolePosition(input.roles, input.botMember);
  const roleChecks = (input.targetRoleIds || []).map(id => {
    const role = input.roles.find(candidate => String(candidate.id) === String(id));
    const ok = Boolean(role && !role.managed && Number(role.position || 0) < topPosition);
    return { code: `role_hierarchy:${id}`, label: role?.name || `Role ${id}`, ok, detail: ok ? 'Orbit can manage this role.' : role ? 'This role is managed or at/above Orbit’s highest role.' : 'This role is missing from the server.' };
  });
  const allChecks = [...checks, ...roleChecks];
  const blocked = allChecks.filter(check => !check.ok);
  return {
    ok: blocked.length === 0,
    checks: allChecks,
    blocking: blocked.map(check => check.code),
    next_step: blocked.length ? 'Update Orbit’s role permissions or move its highest role above the selected target, then run the check again.' : 'Preflight passed. The requested operation can proceed.',
    bot: { user_id: String(input.botMember.user?.id || ''), top_role_position: topPosition, guild_permissions: guildPermissions.toString(), channel_permissions: channelPermissions.toString() },
    channel: input.channel ? { id: input.channel.id || null, name: input.channel.name || null } : null,
  };
}

// Roadmap permissions only; Orbit intentionally does not request Administrator.
export const ORBIT_INSTALL_PERMISSIONS = '17592454556692';
