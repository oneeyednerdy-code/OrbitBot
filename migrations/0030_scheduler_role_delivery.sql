ALTER TABLE scheduled_post_runs ADD COLUMN ping_role_id TEXT;
CREATE INDEX IF NOT EXISTS idx_scheduled_runs_guild_post ON scheduled_post_runs(guild_id, scheduled_post_id, attempted_at DESC);
