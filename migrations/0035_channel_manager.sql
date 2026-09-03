CREATE TABLE IF NOT EXISTS channel_manager_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  structure_json TEXT NOT NULL,
  target_ids_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_channel_manager_snapshots_guild
  ON channel_manager_snapshots(guild_id, created_at DESC);

CREATE TABLE IF NOT EXISTS channel_manager_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  request_json TEXT NOT NULL,
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  snapshot_id INTEGER,
  error_summary_json TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  FOREIGN KEY(snapshot_id) REFERENCES channel_manager_snapshots(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_channel_manager_jobs_guild
  ON channel_manager_jobs(guild_id, created_at DESC);

CREATE TABLE IF NOT EXISTS channel_manager_job_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  channel_id TEXT,
  new_channel_id TEXT,
  channel_type INTEGER,
  name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  error_code TEXT,
  request_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY(job_id) REFERENCES channel_manager_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_channel_manager_items_job
  ON channel_manager_job_items(job_id, sort_order, id);
