CREATE TABLE IF NOT EXISTS creator_role_alert_configs (
 guild_id TEXT PRIMARY KEY,
 enabled INTEGER NOT NULL DEFAULT 0,
 required_role_id TEXT,
 discord_channel_id TEXT,
 mention_role_id TEXT,
 live_message TEXT NOT NULL DEFAULT '🔴 **{creator} is LIVE on {platform}!**\n{title}\n{url}',
 poll_interval_minutes INTEGER NOT NULL DEFAULT 5,
 updated_by TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS creator_role_alert_states (
 guild_id TEXT NOT NULL,
 directory_creator_id INTEGER NOT NULL,
 platform TEXT NOT NULL,
 last_live_state INTEGER NOT NULL DEFAULT 0,
 last_external_id TEXT,
 eligible INTEGER NOT NULL DEFAULT 0,
 last_checked_at INTEGER,
 last_notified_at INTEGER,
 last_error TEXT,
 PRIMARY KEY (guild_id, directory_creator_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_creator_role_alert_states_due
 ON creator_role_alert_states(guild_id, last_checked_at);
