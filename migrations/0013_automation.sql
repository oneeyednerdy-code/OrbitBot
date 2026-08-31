CREATE TABLE IF NOT EXISTS automation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  automation_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL,
  detail_json TEXT,
  ran_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_automation_runs ON automation_runs(guild_id, ran_at DESC);
