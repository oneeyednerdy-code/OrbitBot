CREATE TABLE IF NOT EXISTS kofi_totals (
 guild_id TEXT NOT NULL,
 currency TEXT NOT NULL,
 amount_minor INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(guild_id,currency)
);
CREATE TABLE IF NOT EXISTS kofi_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 guild_id TEXT NOT NULL,
 transaction_id TEXT,
 event_type TEXT,
 amount_minor INTEGER NOT NULL,
 currency TEXT NOT NULL,
 received_at INTEGER NOT NULL,
 UNIQUE(guild_id,transaction_id)
);
