CREATE TABLE IF NOT EXISTS application_forms (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 guild_id TEXT NOT NULL,
 name TEXT NOT NULL,
 description TEXT,
 fields_json TEXT NOT NULL DEFAULT '[]',
 staff_role_id TEXT,
 destination_channel_id TEXT,
 enabled INTEGER NOT NULL DEFAULT 1,
 public_token_hash TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS application_submissions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 form_id INTEGER NOT NULL,
 guild_id TEXT NOT NULL,
 user_id TEXT,
 answers_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 staff_notes TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
