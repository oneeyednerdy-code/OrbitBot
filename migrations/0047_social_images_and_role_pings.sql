ALTER TABLE social_publish_posts ADD COLUMN media_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE social_publish_posts ADD COLUMN ping_role_id TEXT;

CREATE TABLE IF NOT EXISTS social_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_social_media_guild ON social_media(guild_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_media_expiry ON social_media(expires_at);
