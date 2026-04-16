CREATE TABLE IF NOT EXISTS want_list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  media_type TEXT CHECK(media_type IN ('vinyl', 'cassette', 'cd')),
  notes TEXT,
  is_acquired INTEGER NOT NULL DEFAULT 0 CHECK (is_acquired IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_want_list_created_at ON want_list_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_want_list_is_acquired ON want_list_items(is_acquired);
