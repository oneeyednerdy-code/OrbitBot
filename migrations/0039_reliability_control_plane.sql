CREATE TABLE IF NOT EXISTS orbit_action_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  actor_user_id TEXT,
  request_json TEXT NOT NULL DEFAULT '{}',
  progress_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  last_request_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orbit_action_jobs_guild
  ON orbit_action_jobs(guild_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orbit_action_jobs_status
  ON orbit_action_jobs(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS orbit_action_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_job_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(action_job_id) REFERENCES orbit_action_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orbit_action_events_job
  ON orbit_action_events(action_job_id, created_at ASC);

CREATE TABLE IF NOT EXISTS orbit_resource_bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  module TEXT NOT NULL,
  binding_key TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expected_json TEXT NOT NULL DEFAULT '{}',
  last_seen_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(guild_id, resource_type, module, binding_key)
);

CREATE INDEX IF NOT EXISTS idx_orbit_resource_bindings_guild
  ON orbit_resource_bindings(guild_id, status, resource_type);

CREATE TABLE IF NOT EXISTS orbit_rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  scope TEXT,
  route TEXT,
  remaining INTEGER,
  reset_at INTEGER,
  observed_at INTEGER NOT NULL
);

ALTER TABLE channel_manager_jobs ADD COLUMN action_job_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_channel_manager_action_job ON channel_manager_jobs(action_job_id);

ALTER TABLE community_events ADD COLUMN event_message_id TEXT;
