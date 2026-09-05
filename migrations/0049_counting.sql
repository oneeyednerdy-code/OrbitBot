CREATE TABLE IF NOT EXISTS counting_configs (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  channel_id TEXT,
  start_number INTEGER NOT NULL DEFAULT 1,
  current_number INTEGER NOT NULL DEFAULT 1,
  require_alternating INTEGER NOT NULL DEFAULT 1,
  numbers_only INTEGER NOT NULL DEFAULT 1,
  reset_on_mistake INTEGER NOT NULL DEFAULT 1,
  delete_invalid_messages INTEGER NOT NULL DEFAULT 0,
  correct_reaction TEXT NOT NULL DEFAULT '✅',
  wrong_reaction TEXT NOT NULL DEFAULT '❌',
  wrong_message TEXT NOT NULL DEFAULT 'That was not the next number. The count resets to {count}. Expected {expected}, received {received}.',
  same_user_message TEXT NOT NULL DEFAULT 'Let someone else count next, {user}.',
  last_user_id TEXT,
  last_message_id TEXT,
  correct_count INTEGER NOT NULL DEFAULT 0,
  mistake_count INTEGER NOT NULL DEFAULT 0,
  highest_number INTEGER NOT NULL DEFAULT 1,
  last_mistake_at INTEGER,
  updated_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_counting_active ON counting_configs(enabled, channel_id);

CREATE TABLE IF NOT EXISTS counting_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  expected_number INTEGER NOT NULL,
  received_number INTEGER,
  result TEXT NOT NULL CHECK(result IN ('correct','wrong','same_user','ignored')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_counting_activity_guild ON counting_activity(guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_counting_activity_message ON counting_activity(message_id);
