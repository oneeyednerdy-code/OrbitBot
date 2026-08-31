-- Orbit Foundation: roadmap contracts. Feature modules can activate incrementally without reshaping the core database.
CREATE TABLE IF NOT EXISTS guild_modules (
  guild_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT,
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, module_id)
);

CREATE TABLE IF NOT EXISTS honeypot_configs (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  channel_id TEXT,
  delete_trigger INTEGER NOT NULL DEFAULT 1,
  cleanup_minutes INTEGER NOT NULL DEFAULT 60,
  cleanup_scope TEXT NOT NULL DEFAULT 'guild',
  log_channel_id TEXT,
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS honeypot_exempt_roles (guild_id TEXT NOT NULL, role_id TEXT NOT NULL, PRIMARY KEY(guild_id, role_id));
CREATE TABLE IF NOT EXISTS honeypot_exempt_users (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY(guild_id, user_id));

CREATE TABLE IF NOT EXISTS moderation_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  reason TEXT,
  metadata_json TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_moderation_guild_created ON moderation_cases(guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_target ON moderation_cases(guild_id, target_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS role_panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  name TEXT NOT NULL,
  interaction_type TEXT NOT NULL DEFAULT 'button',
  config_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_role_panels_guild ON role_panels(guild_id, enabled);

CREATE TABLE IF NOT EXISTS ticket_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  emoji TEXT,
  discord_category_id TEXT,
  staff_role_ids_json TEXT NOT NULL DEFAULT '[]',
  form_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  category_id INTEGER,
  channel_id TEXT,
  opener_user_id TEXT NOT NULL,
  claimed_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  form_response_json TEXT,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  FOREIGN KEY(category_id) REFERENCES ticket_categories(id)
);
CREATE INDEX IF NOT EXISTS idx_tickets_guild_status ON tickets(guild_id, status, opened_at DESC);

CREATE TABLE IF NOT EXISTS xp_members (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0,
  last_xp_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(guild_id, user_id)
);
CREATE TABLE IF NOT EXISTS level_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  role_id TEXT NOT NULL,
  remove_previous INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_level_rewards_guild ON level_rewards(guild_id, level);

CREATE TABLE IF NOT EXISTS automations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  trigger_json TEXT NOT NULL,
  conditions_json TEXT NOT NULL DEFAULT '[]',
  actions_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_automations_guild ON automations(guild_id, enabled);

CREATE TABLE IF NOT EXISTS post_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  template_id INTEGER,
  content_json TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  scheduled_for INTEGER NOT NULL,
  recurrence_rule TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_dispatch_attempt_at INTEGER,
  FOREIGN KEY(template_id) REFERENCES post_templates(id)
);
CREATE INDEX IF NOT EXISTS idx_scheduled_due ON scheduled_posts(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_guild ON scheduled_posts(guild_id, scheduled_for DESC);
CREATE TABLE IF NOT EXISTS scheduled_post_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scheduled_post_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  status TEXT NOT NULL,
  discord_message_id TEXT,
  error_code TEXT,
  attempted_at INTEGER NOT NULL,
  FOREIGN KEY(scheduled_post_id) REFERENCES scheduled_posts(id)
);

CREATE TABLE IF NOT EXISTS kofi_integrations (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  webhook_token_hash TEXT,
  default_channel_id TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kofi_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  actions_json TEXT NOT NULL DEFAULT '[]',
  triggered_at INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS social_integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  account_label TEXT,
  credential_ref TEXT,
  discord_channel_id TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_integrations_guild ON social_integrations(guild_id, platform, enabled);
CREATE TABLE IF NOT EXISTS social_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  integration_id INTEGER,
  external_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  received_at INTEGER NOT NULL,
  UNIQUE(integration_id, external_id, event_type)
);

CREATE TABLE IF NOT EXISTS diagnostic_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  requested_by TEXT,
  status TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_diagnostics_guild ON diagnostic_runs(guild_id, created_at DESC);
