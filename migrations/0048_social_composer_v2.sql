ALTER TABLE social_publish_posts ADD COLUMN content_variants_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE social_publish_posts ADD COLUMN campaign TEXT;
ALTER TABLE social_publish_posts ADD COLUMN template_id INTEGER;
ALTER TABLE social_media ADD COLUMN alt_text TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS social_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  content_variants_json TEXT NOT NULL DEFAULT '{}',
  targets_json TEXT NOT NULL DEFAULT '[]',
  campaign TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_social_templates_guild ON social_templates(guild_id, name);
CREATE INDEX IF NOT EXISTS idx_social_campaign ON social_publish_posts(guild_id, campaign, scheduled_for);
