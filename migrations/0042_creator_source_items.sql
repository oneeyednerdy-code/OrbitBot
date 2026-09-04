CREATE TABLE IF NOT EXISTS creator_source_items (
  source_id INTEGER NOT NULL,
  external_id TEXT NOT NULL,
  announced_at INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (source_id, external_id),
  FOREIGN KEY(source_id) REFERENCES creator_sources(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_creator_source_items_source ON creator_source_items(source_id, announced_at);
