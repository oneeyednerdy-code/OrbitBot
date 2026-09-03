ALTER TABLE scheduled_posts ADD COLUMN dispatch_lease_until INTEGER;
ALTER TABLE scheduled_posts ADD COLUMN dispatch_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE social_publish_posts ADD COLUMN dispatch_lease_until INTEGER;
ALTER TABLE social_publish_posts ADD COLUMN dispatch_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE channel_manager_jobs ADD COLUMN lease_expires_at INTEGER;
ALTER TABLE channel_manager_jobs ADD COLUMN heartbeat_at INTEGER;
ALTER TABLE channel_manager_jobs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE channel_manager_job_items ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE security_configs ADD COLUMN operation_status TEXT;
ALTER TABLE security_configs ADD COLUMN operation_errors_json TEXT;
ALTER TABLE shield_configs ADD COLUMN operation_status TEXT;
ALTER TABLE shield_configs ADD COLUMN operation_errors_json TEXT;
ALTER TABLE creator_safety_configs ADD COLUMN operation_status TEXT;
ALTER TABLE creator_safety_configs ADD COLUMN operation_errors_json TEXT;

ALTER TABLE lockdown_channel_snapshots ADD COLUMN restore_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE lockdown_channel_snapshots ADD COLUMN last_error_code TEXT;
ALTER TABLE lockdown_channel_snapshots ADD COLUMN last_attempt_at INTEGER;
ALTER TABLE shield_channel_snapshots ADD COLUMN restore_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE shield_channel_snapshots ADD COLUMN last_error_code TEXT;
ALTER TABLE shield_channel_snapshots ADD COLUMN last_attempt_at INTEGER;
ALTER TABLE creator_safety_snapshots ADD COLUMN restore_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE creator_safety_snapshots ADD COLUMN last_error_code TEXT;
ALTER TABLE creator_safety_snapshots ADD COLUMN last_attempt_at INTEGER;

ALTER TABLE sessions ADD COLUMN refresh_token TEXT;
ALTER TABLE sessions ADD COLUMN oauth_scope TEXT;
ALTER TABLE sessions ADD COLUMN token_type TEXT;
ALTER TABLE sessions ADD COLUMN session_expires_at INTEGER;
UPDATE sessions SET session_expires_at=expires_at WHERE session_expires_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_hard_expiry ON sessions(session_expires_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_dispatch_lease ON scheduled_posts(status,dispatch_lease_until,scheduled_for);
CREATE INDEX IF NOT EXISTS idx_social_dispatch_lease ON social_publish_posts(status,dispatch_lease_until,scheduled_for);
CREATE INDEX IF NOT EXISTS idx_channel_manager_lease ON channel_manager_jobs(status,lease_expires_at,created_at);
