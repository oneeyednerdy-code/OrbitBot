CREATE TABLE IF NOT EXISTS social_publish_posts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 guild_id TEXT NOT NULL,
 content TEXT NOT NULL,
 targets_json TEXT NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT 'draft',
 scheduled_for INTEGER,
 created_by TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS social_publish_runs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 post_id INTEGER NOT NULL,
 guild_id TEXT NOT NULL,
 platform TEXT NOT NULL,
 status TEXT NOT NULL,
 external_id TEXT,
 error_code TEXT,
 attempted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_publish_due ON social_publish_posts(status, scheduled_for);
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_integration_account_unique ON social_integrations(guild_id, platform, account_label);
