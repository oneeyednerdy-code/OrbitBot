CREATE TABLE IF NOT EXISTS creator_directory (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 guild_id TEXT NOT NULL,
 discord_user_id TEXT,
 display_name TEXT NOT NULL,
 twitch_name TEXT,
 youtube_channel_id TEXT,
 bio TEXT,
 live_role_id TEXT,
 approved INTEGER NOT NULL DEFAULT 1,
 enabled INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creator_directory_guild ON creator_directory(guild_id,enabled,approved);
