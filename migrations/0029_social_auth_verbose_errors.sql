ALTER TABLE connection_oauth_states ADD COLUMN context_json TEXT;

CREATE TABLE IF NOT EXISTS orbit_error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  request_id TEXT NOT NULL,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  status INTEGER NOT NULL,
  error_code TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orbit_error_log_guild ON orbit_error_log(guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orbit_error_log_request ON orbit_error_log(request_id);
