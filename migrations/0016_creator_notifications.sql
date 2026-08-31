CREATE TABLE IF NOT EXISTS creator_sources (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 guild_id TEXT NOT NULL,
 source_type TEXT NOT NULL,
 label TEXT NOT NULL,
 source_value TEXT NOT NULL,
 discord_channel_id TEXT NOT NULL,
 mention_role_id TEXT,
 last_external_id TEXT,
 enabled INTEGER NOT NULL DEFAULT 1,
 last_checked_at INTEGER,
 last_error TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creator_sources_enabled ON creator_sources(enabled, source_type, last_checked_at);
