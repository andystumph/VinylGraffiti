CREATE TABLE IF NOT EXISTS release_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  length_ms INTEGER,
  FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_release_tracks_release_id ON release_tracks(release_id);
CREATE INDEX IF NOT EXISTS idx_release_tracks_title ON release_tracks(title);
