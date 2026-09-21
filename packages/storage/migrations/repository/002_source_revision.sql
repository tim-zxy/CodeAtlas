CREATE TABLE revisions (
  id TEXT PRIMARY KEY CHECK (length(id) > 0),
  repository_id TEXT NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('COMMIT', 'WORKTREE', 'SNAPSHOT')),
  content_fingerprint TEXT NOT NULL CHECK (length(content_fingerprint) > 0),
  commit_identity TEXT,
  base_revision_id TEXT,
  source_revision_id TEXT,
  UNIQUE (repository_id, id),
  CHECK (
    (kind = 'COMMIT' AND commit_identity IS NOT NULL AND base_revision_id IS NULL AND source_revision_id IS NULL) OR
    (kind = 'WORKTREE' AND commit_identity IS NULL AND source_revision_id IS NULL) OR
    (kind = 'SNAPSHOT' AND commit_identity IS NULL AND base_revision_id IS NULL)
  )
) STRICT;

CREATE INDEX idx_revisions_fingerprint ON revisions(repository_id, content_fingerprint);

CREATE TABLE source_files (
  revision_id TEXT NOT NULL,
  id TEXT NOT NULL CHECK (length(id) > 0),
  repository_id TEXT NOT NULL,
  path TEXT NOT NULL CHECK (length(path) > 0),
  content_fingerprint TEXT NOT NULL CHECK (length(content_fingerprint) > 0),
  role TEXT NOT NULL CHECK (role IN ('SOURCE', 'TEST', 'OTHER')),
  provenance TEXT NOT NULL CHECK (provenance IN ('AUTHORED', 'GENERATED', 'VENDOR')),
  content_kind TEXT NOT NULL CHECK (content_kind IN ('TEXT', 'BINARY')),
  language_hint TEXT,
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('PUBLIC', 'INTERNAL', 'SENSITIVE', 'SECRET')),
  PRIMARY KEY (revision_id, id),
  UNIQUE (revision_id, path),
  FOREIGN KEY (repository_id, revision_id) REFERENCES revisions(repository_id, id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_source_files_path ON source_files(repository_id, path, revision_id);
