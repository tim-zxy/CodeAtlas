-- Candidate Claim storage only. This slice never generates or inserts Claims.
-- snapshot_ref is reserved data, not a FK to nonexistent W010 or capture authority.
CREATE TABLE claims (
 id TEXT PRIMARY KEY CHECK(length(id)>0),
 document_revision_id TEXT REFERENCES document_revisions(id),
 snapshot_ref TEXT,
 kind TEXT NOT NULL CHECK(kind IN ('OBSERVED','DECLARED','INFERRED','CURATED')),
 state_intent TEXT NOT NULL CHECK(state_intent IN ('CURRENT','TARGET','HISTORICAL','TRANSITION','DESIRED')),
 subject_json TEXT NOT NULL CHECK(json_valid(subject_json) AND json_type(subject_json)='object'),
 predicate TEXT NOT NULL CHECK(length(predicate)>0),
 value_json TEXT NOT NULL CHECK(json_valid(value_json) AND json_type(value_json)='object'),
 scope_json TEXT NOT NULL CHECK(json_valid(scope_json) AND json_type(scope_json)='object'),
 confidence_json TEXT NOT NULL CHECK(json_valid(confidence_json) AND json_type(confidence_json)='object'),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
 CHECK((document_revision_id IS NOT NULL AND snapshot_ref IS NULL) OR (document_revision_id IS NULL AND snapshot_ref IS NOT NULL AND length(snapshot_ref)>0))
) STRICT;
CREATE TABLE claim_evidence (
 claim_id TEXT NOT NULL REFERENCES claims(id),
 support_key TEXT NOT NULL CHECK(length(support_key)>0),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
 PRIMARY KEY(claim_id,support_key)
) STRICT;
