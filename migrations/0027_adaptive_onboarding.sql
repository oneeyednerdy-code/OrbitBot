CREATE TABLE IF NOT EXISTS guild_onboarding (
  guild_id TEXT PRIMARY KEY,
  community_type TEXT,
  completed_at INTEGER,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS guild_features (
  guild_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, feature_key)
);

CREATE TABLE IF NOT EXISTS connection_oauth_states (
  state_hash TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_connection_oauth_expiry ON connection_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS creator_account_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  account_label TEXT NOT NULL,
  credential_ciphertext TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'connected',
  expires_at INTEGER,
  connected_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(guild_id, platform, account_id)
);
CREATE INDEX IF NOT EXISTS idx_creator_connections_guild ON creator_account_connections(guild_id, platform, status);
