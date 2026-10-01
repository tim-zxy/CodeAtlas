CREATE TABLE native_analysis_state (
  repository_id TEXT NOT NULL REFERENCES repository(id),
  provider_id TEXT NOT NULL,
  provider_snapshot_id TEXT NOT NULL REFERENCES provider_snapshots(id),
  revision_id TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL,
  header_json TEXT NOT NULL CHECK (json_valid(header_json)),
  PRIMARY KEY (repository_id, provider_id)
) STRICT;

CREATE TABLE native_analysis_file (
  repository_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  source_file_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL,
  summary_json TEXT NOT NULL CHECK (json_valid(summary_json)),
  PRIMARY KEY (repository_id, provider_id, source_file_id),
  UNIQUE (repository_id, provider_id, source_path),
  FOREIGN KEY (repository_id, provider_id)
    REFERENCES native_analysis_state(repository_id, provider_id) ON DELETE CASCADE
) STRICT;
