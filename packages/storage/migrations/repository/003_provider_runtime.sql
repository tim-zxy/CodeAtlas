CREATE TABLE provider_snapshots (
  id TEXT PRIMARY KEY CHECK (length(id) > 0),
  repository_id TEXT NOT NULL,
  provider_id TEXT NOT NULL CHECK (length(provider_id) > 0),
  provider_version TEXT NOT NULL CHECK (length(provider_version) > 0),
  runtime_version TEXT NOT NULL CHECK (length(runtime_version) > 0),
  requested_revision_id TEXT NOT NULL,
  requested_revision_fingerprint TEXT NOT NULL CHECK (length(requested_revision_fingerprint) > 0),
  started_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL CHECK (completed_at >= started_at),
  outcome TEXT NOT NULL CHECK (outcome IN ('SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED')),
  FOREIGN KEY (repository_id, requested_revision_id) REFERENCES revisions(repository_id, id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_provider_snapshots_revision ON provider_snapshots(repository_id, requested_revision_id, provider_id);

CREATE TABLE provider_capabilities (
  snapshot_id TEXT NOT NULL REFERENCES provider_snapshots(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) > 0),
  support TEXT NOT NULL CHECK (support IN ('SUPPORTED', 'UNSUPPORTED')),
  coverage TEXT NOT NULL CHECK (coverage IN ('COMPLETE', 'PARTIAL', 'NONE', 'UNKNOWN')),
  PRIMARY KEY (snapshot_id, name)
) STRICT;
