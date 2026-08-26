CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,username TEXT NOT NULL,avatar TEXT,access_token TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS guild_config (guild_id TEXT PRIMARY KEY,guild_name TEXT,rules_role_id TEXT,verified_role_id TEXT,combined_role_id TEXT,remove_combined_when_invalid INTEGER NOT NULL DEFAULT 1,updated_by TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS verification_sessions (token_hash TEXT PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL,completed_at INTEGER,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,user_id TEXT,actor_user_id TEXT,action TEXT NOT NULL,details TEXT,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_guild ON audit_events(guild_id,created_at DESC);
