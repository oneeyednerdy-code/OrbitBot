CREATE TABLE IF NOT EXISTS leveling_configs (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  xp_min INTEGER NOT NULL DEFAULT 15,
  xp_max INTEGER NOT NULL DEFAULT 25,
  cooldown_seconds INTEGER NOT NULL DEFAULT 60,
  announce_channel_id TEXT,
  updated_at INTEGER NOT NULL
);
