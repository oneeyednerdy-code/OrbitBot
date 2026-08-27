ALTER TABLE guild_config ADD COLUMN notify_rules_granted INTEGER NOT NULL DEFAULT 1;
ALTER TABLE guild_config ADD COLUMN notify_verified_granted INTEGER NOT NULL DEFAULT 1;
