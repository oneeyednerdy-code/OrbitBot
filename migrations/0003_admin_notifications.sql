ALTER TABLE guild_config ADD COLUMN admin_log_channel_id TEXT;
ALTER TABLE guild_config ADD COLUMN notify_combined_granted INTEGER NOT NULL DEFAULT 1;
ALTER TABLE guild_config ADD COLUMN notify_combined_removed INTEGER NOT NULL DEFAULT 1;
