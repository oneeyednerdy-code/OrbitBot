ALTER TABLE application_forms ADD COLUMN panel_channel_id TEXT;
ALTER TABLE application_forms ADD COLUMN panel_message_id TEXT;
ALTER TABLE application_forms ADD COLUMN panel_title TEXT;
ALTER TABLE application_forms ADD COLUMN panel_description TEXT;
ALTER TABLE application_forms ADD COLUMN panel_button_label TEXT;
ALTER TABLE application_forms ADD COLUMN panel_posted_at INTEGER;

ALTER TABLE application_submissions ADD COLUMN interaction_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_application_submissions_interaction_id
  ON application_submissions(interaction_id)
  WHERE interaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS application_form_sessions (
  session_id TEXT PRIMARY KEY,
  form_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  answers_json TEXT NOT NULL DEFAULT '{}',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_application_form_sessions_expiry
  ON application_form_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_application_form_sessions_owner
  ON application_form_sessions(guild_id,user_id,form_id);
