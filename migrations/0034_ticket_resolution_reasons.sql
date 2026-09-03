ALTER TABLE tickets ADD COLUMN closed_reason TEXT;
ALTER TABLE tickets ADD COLUMN closed_by_user_id TEXT;
ALTER TABLE tickets ADD COLUMN deleted_at INTEGER;
ALTER TABLE tickets ADD COLUMN deleted_reason TEXT;
ALTER TABLE tickets ADD COLUMN deleted_by_user_id TEXT;

