ALTER TABLE sessions ADD COLUMN csrf_token TEXT;
UPDATE sessions SET csrf_token = lower(hex(randomblob(32))) WHERE csrf_token IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_verify_expiry ON verification_sessions(expires_at);
