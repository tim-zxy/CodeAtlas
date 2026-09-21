CREATE TABLE analysis_coverage (
  id INTEGER PRIMARY KEY,
  provider_snapshot_id TEXT NOT NULL REFERENCES provider_snapshots(id) ON DELETE CASCADE,
  capability_name TEXT NOT NULL CHECK (length(capability_name) > 0),
  source_file_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('COMPLETE', 'PARTIAL', 'NONE', 'UNKNOWN')),
  FOREIGN KEY (provider_snapshot_id, capability_name) REFERENCES provider_capabilities(snapshot_id, name) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_analysis_coverage_capability ON analysis_coverage(provider_snapshot_id, capability_name, source_file_id);
