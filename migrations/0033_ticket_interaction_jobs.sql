ALTER TABLE tickets ADD COLUMN interaction_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_interaction_id ON tickets(interaction_id) WHERE interaction_id IS NOT NULL;
