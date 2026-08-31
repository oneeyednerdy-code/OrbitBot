ALTER TABLE social_integrations ADD COLUMN credential_ciphertext TEXT;
ALTER TABLE social_integrations ADD COLUMN status TEXT NOT NULL DEFAULT 'configured';
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_one_account ON social_integrations(guild_id, platform, account_label);
