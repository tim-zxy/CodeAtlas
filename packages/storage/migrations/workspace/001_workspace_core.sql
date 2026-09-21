CREATE TABLE workspace (
  slot INTEGER PRIMARY KEY CHECK (slot = 1),
  id TEXT NOT NULL UNIQUE CHECK (length(id) > 0),
  root_path TEXT NOT NULL CHECK (length(root_path) > 0)
) STRICT;
