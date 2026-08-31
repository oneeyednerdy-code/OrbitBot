CREATE TABLE IF NOT EXISTS community_configs (
 guild_id TEXT PRIMARY KEY,
 welcome_channel_id TEXT,
 welcome_message TEXT,
 goodbye_channel_id TEXT,
 goodbye_message TEXT,
 autorole_id TEXT,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS custom_commands (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 guild_id TEXT NOT NULL,
 command TEXT NOT NULL,
 response TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL,
 UNIQUE(guild_id, command)
);
CREATE TABLE IF NOT EXISTS sticky_configs (
 guild_id TEXT NOT NULL,
 channel_id TEXT NOT NULL,
 content TEXT NOT NULL,
 every_n_messages INTEGER NOT NULL DEFAULT 10,
 message_count INTEGER NOT NULL DEFAULT 0,
 last_message_id TEXT,
 enabled INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(guild_id, channel_id)
);
