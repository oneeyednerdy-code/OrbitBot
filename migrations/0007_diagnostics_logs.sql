CREATE TABLE IF NOT EXISTS security_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_findings_guild ON security_findings(guild_id, created_at DESC);
