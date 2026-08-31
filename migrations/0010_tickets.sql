ALTER TABLE ticket_categories ADD COLUMN panel_channel_id TEXT;
ALTER TABLE ticket_categories ADD COLUMN panel_message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ticket_category_enabled ON ticket_categories(guild_id, enabled, sort_order);
