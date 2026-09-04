ALTER TABLE creator_account_connections ADD COLUMN account_login TEXT;

CREATE TABLE IF NOT EXISTS owner_stream_alert_configs (
  guild_id TEXT PRIMARY KEY,
  connection_id INTEGER NOT NULL,
  discord_channel_id TEXT NOT NULL,
  mention_role_id TEXT,
  live_message TEXT NOT NULL DEFAULT '🔴 **{creator} is LIVE on Twitch!**\n{title}\n{url}',
  poll_interval_minutes INTEGER NOT NULL DEFAULT 5,
  enabled INTEGER NOT NULL DEFAULT 0,
  last_live_state INTEGER NOT NULL DEFAULT 0,
  last_stream_id TEXT,
  last_checked_at INTEGER,
  last_notified_at INTEGER,
  last_error TEXT,
  updated_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(connection_id) REFERENCES creator_account_connections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_owner_stream_alerts_due
  ON owner_stream_alert_configs(enabled, last_checked_at);
