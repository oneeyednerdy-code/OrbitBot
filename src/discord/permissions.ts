export const MANAGE_GUILD = 0x20n;
export const ADMINISTRATOR = 0x8n;

export function canManageGuild(permissions: string): boolean {
  const value = BigInt(permissions);
  return (value & MANAGE_GUILD) !== 0n || (value & ADMINISTRATOR) !== 0n;
}

// Roadmap permissions only; Orbit intentionally does not request Administrator.
export const ORBIT_INSTALL_PERMISSIONS = '17592454556692';
