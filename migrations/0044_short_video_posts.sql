CREATE TABLE IF NOT EXISTS short_video_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  media_url TEXT NOT NULL,
  caption TEXT NOT NULL,
  targets_json TEXT NOT NULL DEFAULT '[]',
  youtube_privacy_status TEXT NOT NULL DEFAULT 'private',
  tiktok_privacy_level TEXT,
  tiktok_allow_comment INTEGER NOT NULL DEFAULT 0,
  tiktok_allow_duet INTEGER NOT NULL DEFAULT 0,
  tiktok_allow_stitch INTEGER NOT NULL DEFAULT 0,
  scheduled_for INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  dispatch_attempts INTEGER NOT NULL DEFAULT 0,
  dispatch_lease_until INTEGER,
  last_error TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_short_video_due ON short_video_posts(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_short_video_guild ON short_video_posts(guild_id, created_at DESC);

CREATE TABLE IF NOT EXISTS short_video_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  external_id TEXT,
  error_code TEXT,
  attempted_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(post_id, platform),
  FOREIGN KEY(post_id) REFERENCES short_video_posts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_short_video_runs_processing ON short_video_runs(status, updated_at);
