CREATE TABLE repository (
  slot INTEGER PRIMARY KEY CHECK (slot = 1),
  id TEXT NOT NULL UNIQUE CHECK (length(id) > 0),
  root_path TEXT NOT NULL CHECK (length(root_path) > 0)
) STRICT;

CREATE TABLE repository_state (
  repository_id TEXT PRIMARY KEY REFERENCES repository(id) ON DELETE CASCADE,
  indexed_revision_id TEXT
) STRICT;
