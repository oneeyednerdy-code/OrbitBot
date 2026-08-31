CREATE TABLE IF NOT EXISTS orbit_bug_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bug_id TEXT NOT NULL UNIQUE,
  guild_id TEXT NOT NULL,
  reporter_user_id TEXT NOT NULL,
  area TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT,
  current_page TEXT,
  orbit_version TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'new',
  diagnostic_json TEXT NOT NULL DEFAULT '{}',
  client_json TEXT NOT NULL DEFAULT '{}',
  fingerprint TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bug_reports_guild ON orbit_bug_reports(guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON orbit_bug_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_fingerprint ON orbit_bug_reports(fingerprint, created_at DESC);

CREATE TABLE IF NOT EXISTS orbit_bug_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bug_report_id INTEGER NOT NULL,
  actor_user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (bug_report_id) REFERENCES orbit_bug_reports(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bug_events_report ON orbit_bug_events(bug_report_id, created_at);
