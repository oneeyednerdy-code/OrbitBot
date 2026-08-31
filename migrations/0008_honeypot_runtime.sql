CREATE TABLE IF NOT EXISTS recent_messages (
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT PRIMARY KEY,
  author_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recent_messages_cleanup ON recent_messages(guild_id, author_user_id, created_at DESC);
