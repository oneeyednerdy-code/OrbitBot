CREATE TABLE IF NOT EXISTS creator_safety_configs (
 guild_id TEXT PRIMARY KEY,
 enabled INTEGER NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 0,
 channel_ids_json TEXT NOT NULL DEFAULT '[]',
 alert_channel_id TEXT,
 updated_by TEXT,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS creator_safety_snapshots (
 guild_id TEXT NOT NULL,
 channel_id TEXT NOT NULL,
 permission_overwrites_json TEXT NOT NULL,
 captured_at INTEGER NOT NULL,
 PRIMARY KEY(guild_id,channel_id)
);
