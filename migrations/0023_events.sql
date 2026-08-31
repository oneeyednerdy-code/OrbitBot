CREATE TABLE IF NOT EXISTS community_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 guild_id TEXT NOT NULL,
 name TEXT NOT NULL,
 description TEXT,
 starts_at INTEGER NOT NULL,
 ends_at INTEGER,
 discord_channel_id TEXT,
 ping_role_id TEXT,
 signup_limit INTEGER,
 discord_event_id TEXT,
 status TEXT NOT NULL DEFAULT 'scheduled',
 created_by TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS event_signups (
 event_id INTEGER NOT NULL,
 guild_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'going',
 checked_in_at INTEGER,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(event_id,user_id)
);
