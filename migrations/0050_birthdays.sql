CREATE TABLE IF NOT EXISTS birthday_configs (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  channel_id TEXT,
  ping_role_id TEXT,
  message TEXT NOT NULL DEFAULT '🎂 Happy birthday, {user}! We hope you have a wonderful day!',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS birthday_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  month INTEGER NOT NULL,
  day INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(guild_id,user_id),
  CHECK(month BETWEEN 1 AND 12), CHECK(day BETWEEN 1 AND 31)
);
CREATE INDEX IF NOT EXISTS idx_birthdays_due ON birthday_entries(guild_id,enabled,month,day);
CREATE TABLE IF NOT EXISTS birthday_announcement_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  birthday_id INTEGER NOT NULL,
  announcement_year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'sending',
  discord_message_id TEXT,
  error_code TEXT,
  attempted_at INTEGER NOT NULL,
  UNIQUE(birthday_id,announcement_year)
);
