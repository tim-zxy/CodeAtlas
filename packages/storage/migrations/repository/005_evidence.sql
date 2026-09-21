CREATE TABLE evidence (
  id TEXT PRIMARY KEY CHECK (length(id) > 0),
  repository_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  provider_snapshot_id TEXT NOT NULL REFERENCES provider_snapshots(id) ON DELETE CASCADE,
  fact_type TEXT NOT NULL CHECK (fact_type IN ('NODE', 'EDGE')),
  provider_id TEXT NOT NULL CHECK (length(provider_id) > 0),
  provider_fact_id TEXT NOT NULL CHECK (length(provider_fact_id) > 0),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'INVALIDATED')),
  FOREIGN KEY (repository_id, revision_id) REFERENCES revisions(repository_id, id) ON DELETE CASCADE,
  UNIQUE (id, fact_type, provider_snapshot_id)
) STRICT;

CREATE INDEX idx_evidence_snapshot_status ON evidence(provider_snapshot_id, status);

CREATE TABLE fact_evidence (
  fact_type TEXT NOT NULL CHECK (fact_type IN ('NODE', 'EDGE')),
  canonical_fact_id TEXT NOT NULL CHECK (length(canonical_fact_id) > 0),
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  PRIMARY KEY (fact_type, canonical_fact_id, evidence_id)
) STRICT;

CREATE TABLE provider_fact_bindings (
  fact_type TEXT NOT NULL CHECK (fact_type IN ('NODE', 'EDGE')),
  provider_id TEXT NOT NULL CHECK (length(provider_id) > 0),
  provider_fact_id TEXT NOT NULL CHECK (length(provider_fact_id) > 0),
  provider_snapshot_id TEXT NOT NULL REFERENCES provider_snapshots(id) ON DELETE CASCADE,
  canonical_fact_id TEXT NOT NULL CHECK (length(canonical_fact_id) > 0),
  evidence_id TEXT NOT NULL,
  PRIMARY KEY (evidence_id, fact_type, canonical_fact_id),
  FOREIGN KEY (evidence_id, fact_type, provider_snapshot_id) REFERENCES evidence(id, fact_type, provider_snapshot_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_provider_fact_bindings_provider ON provider_fact_bindings(provider_snapshot_id, provider_id, provider_fact_id);
