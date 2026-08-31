CREATE TABLE IF NOT EXISTS role_panel_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  panel_id INTEGER NOT NULL,
  role_id TEXT NOT NULL,
  label TEXT NOT NULL,
  emoji TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(panel_id) REFERENCES role_panels(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_role_panel_items_panel ON role_panel_items(panel_id, sort_order);
