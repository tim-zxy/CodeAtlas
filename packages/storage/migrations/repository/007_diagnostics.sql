CREATE TABLE analysis_diagnostics (
  provider_snapshot_id TEXT NOT NULL REFERENCES provider_snapshots(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  code TEXT NOT NULL CHECK (length(code) > 0),
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 128),
  source_range_json TEXT CHECK (source_range_json IS NULL OR json_valid(source_range_json)),
  PRIMARY KEY (provider_snapshot_id, ordinal)
) STRICT;

CREATE INDEX idx_analysis_diagnostics_snapshot ON analysis_diagnostics(provider_snapshot_id, severity);
