CREATE TABLE IF NOT EXISTS oauth_states (state_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at);
