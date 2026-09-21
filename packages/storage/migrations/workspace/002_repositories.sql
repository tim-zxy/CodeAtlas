CREATE TABLE repositories (
  repository_id TEXT PRIMARY KEY CHECK (length(repository_id) > 0),
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  root_path TEXT NOT NULL CHECK (length(root_path) > 0),
  UNIQUE (workspace_id, root_path)
) STRICT;

CREATE INDEX idx_workspace_repositories ON repositories(workspace_id, repository_id);
