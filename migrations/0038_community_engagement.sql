CREATE TABLE IF NOT EXISTS community_engagement_banks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  question_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_engagement_banks_guild ON community_engagement_banks(guild_id, active, uploaded_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_engagement_active_bank ON community_engagement_banks(guild_id) WHERE active=1;

CREATE TABLE IF NOT EXISTS community_engagement_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  bank_id INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  question_key TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(bank_id, question_key),
  FOREIGN KEY(bank_id) REFERENCES community_engagement_banks(id)
);
CREATE INDEX IF NOT EXISTS idx_engagement_questions_bank ON community_engagement_questions(guild_id, bank_id);
CREATE INDEX IF NOT EXISTS idx_engagement_questions_key ON community_engagement_questions(guild_id, question_key);

CREATE TABLE IF NOT EXISTS community_engagement_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  question_key TEXT NOT NULL,
  question_text TEXT NOT NULL,
  source_bank_id INTEGER,
  channel_id TEXT,
  discord_message_id TEXT,
  posted_at INTEGER NOT NULL,
  UNIQUE(guild_id, question_key),
  FOREIGN KEY(source_bank_id) REFERENCES community_engagement_banks(id)
);
CREATE INDEX IF NOT EXISTS idx_engagement_history_guild ON community_engagement_history(guild_id, posted_at DESC);

CREATE TABLE IF NOT EXISTS community_engagement_configs (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  channel_id TEXT,
  frequency TEXT NOT NULL DEFAULT 'weekly' CHECK(frequency IN ('daily','weekly','biweekly','monthly')),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  next_post_at INTEGER,
  source_bank_id INTEGER,
  last_posted_at INTEGER,
  last_question TEXT,
  last_message_id TEXT,
  last_error TEXT,
  dispatch_lease_until INTEGER,
  dispatch_attempts INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(source_bank_id) REFERENCES community_engagement_banks(id)
);
CREATE INDEX IF NOT EXISTS idx_engagement_due ON community_engagement_configs(enabled, next_post_at, dispatch_lease_until);
