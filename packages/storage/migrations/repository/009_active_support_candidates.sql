CREATE TABLE active_support_candidates (
  evidence_id TEXT PRIMARY KEY NOT NULL,
  fact_type TEXT NOT NULL CHECK (fact_type IN ('NODE', 'EDGE')),
  canonical_fact_id TEXT NOT NULL CHECK (length(canonical_fact_id) > 0),
  candidate_json TEXT NOT NULL CHECK (json_valid(candidate_json) AND json_type(candidate_json) = 'object'),
  FOREIGN KEY (evidence_id, fact_type, canonical_fact_id)
    REFERENCES provider_fact_bindings(evidence_id, fact_type, canonical_fact_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_active_support_candidates_fact ON active_support_candidates(fact_type, canonical_fact_id);
