CREATE TABLE IF NOT EXISTS shield_configs (
 guild_id TEXT PRIMARY KEY,
 enabled INTEGER NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 0,
 auto_activate INTEGER NOT NULL DEFAULT 1,
 join_threshold INTEGER NOT NULL DEFAULT 15,
 join_window_seconds INTEGER NOT NULL DEFAULT 30,
 duplicate_threshold INTEGER NOT NULL DEFAULT 6,
 mention_threshold INTEGER NOT NULL DEFAULT 8,
 slowmode_seconds INTEGER NOT NULL DEFAULT 30,
 channel_ids_json TEXT NOT NULL DEFAULT '[]',
 alert_channel_id TEXT,
 alert_role_id TEXT,
 activated_at INTEGER,
 activated_reason TEXT,
 updated_by TEXT,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS shield_channel_snapshots (
 guild_id TEXT NOT NULL,
 channel_id TEXT NOT NULL,
 permission_overwrites_json TEXT NOT NULL,
 rate_limit_per_user INTEGER NOT NULL DEFAULT 0,
 captured_at INTEGER NOT NULL,
 PRIMARY KEY(guild_id,channel_id)
);
CREATE TABLE IF NOT EXISTS shield_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 guild_id TEXT NOT NULL,
 event_type TEXT NOT NULL,
 actor_id TEXT,
 fingerprint TEXT,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shield_events_window ON shield_events(guild_id,event_type,created_at);
