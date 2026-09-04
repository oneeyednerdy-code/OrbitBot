ALTER TABLE short_video_posts ADD COLUMN media_key TEXT;
ALTER TABLE short_video_posts ADD COLUMN media_size INTEGER;
ALTER TABLE short_video_posts ADD COLUMN media_content_type TEXT;

CREATE TABLE IF NOT EXISTS short_video_media (
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
CREATE INDEX IF NOT EXISTS idx_short_video_media_guild ON short_video_media(guild_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_short_video_media_expiry ON short_video_media(expires_at);
