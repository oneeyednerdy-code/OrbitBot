ALTER TABLE creator_sources ADD COLUMN live_message TEXT;
ALTER TABLE creator_sources ADD COLUMN offline_message TEXT;
ALTER TABLE creator_sources ADD COLUMN notify_live INTEGER NOT NULL DEFAULT 1;
ALTER TABLE creator_sources ADD COLUMN notify_offline INTEGER NOT NULL DEFAULT 0;
ALTER TABLE creator_sources ADD COLUMN last_live_state INTEGER NOT NULL DEFAULT 0;
ALTER TABLE creator_sources ADD COLUMN vod_url TEXT;
ALTER TABLE creator_sources ADD COLUMN cooldown_minutes INTEGER NOT NULL DEFAULT 10;
ALTER TABLE creator_sources ADD COLUMN last_notified_at INTEGER;
