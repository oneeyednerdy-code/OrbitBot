ALTER TABLE guild_config ADD COLUMN post_audit_events INTEGER NOT NULL DEFAULT 0;

ALTER TABLE audit_events ADD COLUMN discord_log_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE audit_events ADD COLUMN discord_log_message_id TEXT;
ALTER TABLE audit_events ADD COLUMN discord_log_attempted_at INTEGER;
ALTER TABLE audit_events ADD COLUMN discord_log_lease_until INTEGER;

CREATE INDEX IF NOT EXISTS idx_audit_discord_delivery
  ON audit_events(discord_log_status,discord_log_lease_until,created_at);
