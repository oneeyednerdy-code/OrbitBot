CREATE TABLE IF NOT EXISTS tiktok_announce_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  connection_id INTEGER NOT NULL,
  discord_channel_id TEXT NOT NULL,
  message_template TEXT NOT NULL DEFAULT '🎵 **{account} posted a new TikTok**\n{title}\n{url}',
  enabled INTEGER NOT NULL DEFAULT 1,
  poll_interval_minutes INTEGER NOT NULL DEFAULT 10,
  last_checked_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(guild_id, connection_id),
  FOREIGN KEY(connection_id) REFERENCES creator_account_connections(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tiktok_announce_due ON tiktok_announce_configs(enabled, last_checked_at);

CREATE TABLE IF NOT EXISTS tiktok_announcement_videos (
  config_id INTEGER NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT,
  video_url TEXT,
  created_at INTEGER,
  announced_at INTEGER,
  PRIMARY KEY(config_id, video_id),
  FOREIGN KEY(config_id) REFERENCES tiktok_announce_configs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tiktok_announcement_videos_config ON tiktok_announcement_videos(config_id, announced_at);
