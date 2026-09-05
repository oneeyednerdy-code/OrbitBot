import type { Env } from '../types';

export const CONFIG_BACKUP_VERSION = 1;
export const CONFIG_BACKUP_MAX_BYTES = 900_000;

// Only guild-scoped configuration is included. Sessions, OAuth state, credentials,
// moderation history, delivery runs, and Discord message content are intentionally excluded.
export const CONFIG_BACKUP_TABLES = [
  'guild_config', 'guild_modules', 'guild_features', 'guild_onboarding',
  'honeypot_configs', 'honeypot_exempt_roles', 'honeypot_exempt_users',
  'community_configs', 'custom_commands', 'sticky_configs',
  'leveling_configs', 'level_rewards', 'automations', 'post_templates',
  'ticket_categories', 'application_forms',
  'creator_sources', 'creator_role_alert_configs', 'creator_directory',
  'creator_safety_configs', 'security_configs', 'shield_configs',
  'kofi_integrations', 'kofi_milestones', 'social_integrations',
  'community_engagement_banks', 'community_engagement_questions', 'community_engagement_configs',
] as const;

type BackupRow = { table: string; rows: Record<string, unknown>[] };

export async function captureConfigBackup(env: Env, guildId: string): Promise<{ version: number; guild_id: string; captured_at: number; tables: BackupRow[]; exclusions: string[] }> {
  const tables: BackupRow[] = [];
  for (const table of CONFIG_BACKUP_TABLES) {
    try {
      const result = await env.DB.prepare(`SELECT * FROM ${table} WHERE guild_id=?`).bind(guildId).all<any>();
      const rows = result.results.map((row: Record<string, unknown>) => sanitizeRow(table, row));
      tables.push({ table, rows });
    } catch {
      // A cumulative deployment may be upgrading from an older migration set.
    }
  }
  const payload = { version: CONFIG_BACKUP_VERSION, guild_id: guildId, captured_at: Date.now(), tables, exclusions: ['sessions and OAuth state', 'Discord credentials and encrypted social credentials', 'moderation/audit history', 'scheduled delivery runs', 'Discord messages, threads, attachments, and webhooks'] };
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if (bytes > CONFIG_BACKUP_MAX_BYTES) throw new Error('config_backup_too_large');
  return payload;
}

export async function listConfigBackups(env: Env, guildId: string): Promise<any[]> {
  const rows = await env.DB.prepare('SELECT id,name,version,byte_size,created_by,created_at,expires_at FROM orbit_config_backups WHERE guild_id=? ORDER BY created_at DESC LIMIT 20').bind(guildId).all<any>();
  return rows.results;
}

export async function readConfigBackup(env: Env, guildId: string, id: number): Promise<any | null> {
  const row = await env.DB.prepare('SELECT id,name,version,payload_json,byte_size,created_by,created_at,expires_at FROM orbit_config_backups WHERE id=? AND guild_id=?').bind(id, guildId).first<any>();
  if (!row) return null;
  return { ...row, payload: parse(row.payload_json) };
}

export function validateConfigBackup(payload: any, guildId: string): { ok: true; tables: BackupRow[] } | { ok: false; detail: string } {
  if (!payload || Number(payload.version) !== CONFIG_BACKUP_VERSION || String(payload.guild_id) !== String(guildId) || !Array.isArray(payload.tables)) return { ok: false, detail: 'This backup is not a valid Orbit configuration export for the selected server.' };
  const allowed = new Set<string>(CONFIG_BACKUP_TABLES);
  for (const item of payload.tables) {
    if (!item || !allowed.has(String(item.table)) || !Array.isArray(item.rows)) return { ok: false, detail: 'The backup contains an unsupported table.' };
    for (const row of item.rows) if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !/^[a-z][a-z0-9_]*$/i.test(key))) return { ok: false, detail: 'The backup contains an invalid configuration field.' };
  }
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if (bytes > CONFIG_BACKUP_MAX_BYTES) return { ok: false, detail: 'The configuration backup is larger than Orbit’s safe restore limit.' };
  return { ok: true, tables: payload.tables as BackupRow[] };
}

export async function restoreConfigBackup(env: Env, guildId: string, tables: BackupRow[]): Promise<{ tables: number; rows: number }> {
  const tableOrder = new Map(CONFIG_BACKUP_TABLES.map((table, index) => [table, index]));
  const ordered = [...tables].sort((a, b) => (tableOrder.get(a.table as any) || 0) - (tableOrder.get(b.table as any) || 0));
  let rowCount = 0;
  // Remove child rows first so the question-bank foreign keys remain valid.
  for (const item of [...ordered].reverse()) {
    if (item.table === 'ticket_categories') continue;
    await env.DB.prepare(`DELETE FROM ${item.table} WHERE guild_id=?`).bind(guildId).run();
  }
  for (const item of ordered) {
    for (const row of item.rows) {
      const columns = Object.keys(row);
      if (!columns.length) continue;
      if (item.table === 'ticket_categories' && row.id != null) {
        const updateColumns = columns.filter(column => column !== 'id' && column !== 'guild_id');
        if (updateColumns.length) {
          await env.DB.prepare(`UPDATE ticket_categories SET ${updateColumns.map(column => `${column}=?`).join(',')} WHERE id=? AND guild_id=?`).bind(...updateColumns.map(column => row[column] ?? null), row.id, guildId).run();
        }
        const exists = await env.DB.prepare('SELECT id FROM ticket_categories WHERE id=? AND guild_id=?').bind(row.id, guildId).first<any>();
        if (exists) { rowCount += 1; continue; }
      }
      const placeholders = columns.map(() => '?').join(',');
      await env.DB.prepare(`INSERT INTO ${item.table} (${columns.join(',')}) VALUES (${placeholders})`).bind(...columns.map(column => row[column] ?? null)).run();
      rowCount += 1;
    }
  }
  return { tables: ordered.length, rows: rowCount };
}

function sanitizeRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  if (table === 'social_integrations') { delete copy.credential_ciphertext; delete copy.credential_ref; }
  if (table === 'kofi_integrations') delete copy.webhook_token_hash;
  if (table === 'community_engagement_banks') { delete copy.source_path; }
  if (table === 'community_engagement_configs') { delete copy.dispatch_lease_until; delete copy.dispatch_attempts; delete copy.last_error; }
  if (table === 'ticket_categories') delete copy.panel_message_id;
  if (table === 'application_forms') { delete copy.panel_message_id; delete copy.panel_posted_at; }
  if (['security_configs', 'shield_configs', 'creator_safety_configs'].includes(table)) {
    delete copy.active; delete copy.operation_status; delete copy.operation_errors_json; delete copy.activated_at; delete copy.activated_reason;
  }
  return copy;
}
function parse(raw: unknown): any { try { return JSON.parse(String(raw || '{}')); } catch { return {}; } }
