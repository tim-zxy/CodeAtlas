CREATE TABLE activation_history (
  id TEXT PRIMARY KEY CHECK(length(id)>0),
  repository_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  parent_id TEXT,
  manifest_digest TEXT NOT NULL CHECK(length(manifest_digest)=64 AND manifest_digest NOT GLOB '*[^0-9a-f]*'),
  manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json) AND json_type(manifest_json)='object'),
  UNIQUE(repository_id,id),
  CHECK(parent_id IS NULL OR parent_id<>id),
  FOREIGN KEY(repository_id,revision_id) REFERENCES revisions(repository_id,id),
  FOREIGN KEY(repository_id,parent_id) REFERENCES activation_history(repository_id,id)
) STRICT;
CREATE INDEX idx_activation_history_parent ON activation_history(repository_id,parent_id);

CREATE TABLE syntax_origins (
  id TEXT PRIMARY KEY CHECK(length(id)>0),
  repository_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  origin_snapshot_id TEXT NOT NULL CHECK(length(origin_snapshot_id)>0),
  origin_digest TEXT NOT NULL CHECK(length(origin_digest)=64 AND origin_digest NOT GLOB '*[^0-9a-f]*'),
  origin_json TEXT NOT NULL CHECK(json_valid(origin_json) AND json_type(origin_json)='object'),
  UNIQUE(repository_id,id),
  FOREIGN KEY(repository_id,revision_id) REFERENCES revisions(repository_id,id)
) STRICT;
CREATE INDEX idx_syntax_origins_snapshot ON syntax_origins(repository_id,origin_snapshot_id);

CREATE TABLE syntax_projections (
  id TEXT PRIMARY KEY CHECK(length(id)>0),
  repository_id TEXT NOT NULL,
  origin_id TEXT NOT NULL,
  projection_digest TEXT NOT NULL CHECK(length(projection_digest)=64 AND projection_digest NOT GLOB '*[^0-9a-f]*'),
  envelope_json TEXT NOT NULL CHECK(json_valid(envelope_json) AND json_type(envelope_json)='object'),
  UNIQUE(repository_id,id),
  FOREIGN KEY(repository_id,origin_id) REFERENCES syntax_origins(repository_id,id)
) STRICT;
CREATE INDEX idx_syntax_projections_origin ON syntax_projections(repository_id,origin_id);

CREATE TABLE activation_syntax_members (
  activation_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  origin_id TEXT NOT NULL,
  projection_id TEXT NOT NULL,
  PRIMARY KEY(activation_id,origin_id),
  UNIQUE(activation_id,projection_id),
  FOREIGN KEY(repository_id,activation_id) REFERENCES activation_history(repository_id,id),
  FOREIGN KEY(repository_id,origin_id) REFERENCES syntax_origins(repository_id,id),
  FOREIGN KEY(repository_id,projection_id) REFERENCES syntax_projections(repository_id,id)
) STRICT;
CREATE INDEX idx_activation_syntax_projection ON activation_syntax_members(projection_id);

CREATE TABLE active_history_pointer (
  repository_id TEXT PRIMARY KEY REFERENCES repository(id),
  activation_id TEXT NOT NULL,
  FOREIGN KEY(repository_id,activation_id) REFERENCES activation_history(repository_id,id)
) STRICT;
CREATE TRIGGER r011_immutable_activation_history_update BEFORE UPDATE ON activation_history BEGIN SELECT RAISE(ABORT,'R011_IMMUTABLE'); END;
CREATE TRIGGER r011_immutable_activation_history_delete BEFORE DELETE ON activation_history BEGIN SELECT RAISE(ABORT,'R011_IMMUTABLE'); END;
CREATE TRIGGER r011_immutable_syntax_origins_update BEFORE UPDATE ON syntax_origins BEGIN SELECT RAISE(ABORT,'R011_IMMUTABLE'); END;
CREATE TRIGGER r011_immutable_syntax_origins_delete BEFORE DELETE ON syntax_origins BEGIN SELECT RAISE(ABORT,'R011_IMMUTABLE'); END;
CREATE TRIGGER r011_immutable_syntax_projections_update BEFORE UPDATE ON syntax_projections BEGIN SELECT RAISE(ABORT,'R011_IMMUTABLE'); END;
CREATE TRIGGER r011_immutable_syntax_projections_delete BEFORE DELETE ON syntax_projections BEGIN SELECT RAISE(ABORT,'R011_IMMUTABLE'); END;
CREATE TRIGGER r011_immutable_activation_syntax_members_update BEFORE UPDATE ON activation_syntax_members BEGIN SELECT RAISE(ABORT,'R011_IMMUTABLE'); END;
CREATE TRIGGER r011_immutable_activation_syntax_members_delete BEFORE DELETE ON activation_syntax_members BEGIN SELECT RAISE(ABORT,'R011_IMMUTABLE'); END;
CREATE TRIGGER r011_invalidate_canonical_nodes_insert AFTER INSERT ON canonical_nodes BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_canonical_nodes_update AFTER UPDATE ON canonical_nodes BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_canonical_nodes_delete AFTER DELETE ON canonical_nodes BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_canonical_edges_insert AFTER INSERT ON canonical_edges BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_canonical_edges_update AFTER UPDATE ON canonical_edges BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_canonical_edges_delete AFTER DELETE ON canonical_edges BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_unresolved_targets_insert AFTER INSERT ON unresolved_targets BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_unresolved_targets_update AFTER UPDATE ON unresolved_targets BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_unresolved_targets_delete AFTER DELETE ON unresolved_targets BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_evidence_insert AFTER INSERT ON evidence BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_evidence_update AFTER UPDATE ON evidence BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_evidence_delete AFTER DELETE ON evidence BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_provider_fact_bindings_insert AFTER INSERT ON provider_fact_bindings BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_provider_fact_bindings_update AFTER UPDATE ON provider_fact_bindings BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_provider_fact_bindings_delete AFTER DELETE ON provider_fact_bindings BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_fact_evidence_insert AFTER INSERT ON fact_evidence BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_fact_evidence_update AFTER UPDATE ON fact_evidence BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_fact_evidence_delete AFTER DELETE ON fact_evidence BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_active_support_candidates_insert AFTER INSERT ON active_support_candidates BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_active_support_candidates_update AFTER UPDATE ON active_support_candidates BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_active_support_candidates_delete AFTER DELETE ON active_support_candidates BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_provider_snapshots_insert AFTER INSERT ON provider_snapshots BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_provider_snapshots_update AFTER UPDATE ON provider_snapshots BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_provider_snapshots_delete AFTER DELETE ON provider_snapshots BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_provider_capabilities_insert AFTER INSERT ON provider_capabilities BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_provider_capabilities_update AFTER UPDATE ON provider_capabilities BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_provider_capabilities_delete AFTER DELETE ON provider_capabilities BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_analysis_coverage_insert AFTER INSERT ON analysis_coverage BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_analysis_coverage_update AFTER UPDATE ON analysis_coverage BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_analysis_coverage_delete AFTER DELETE ON analysis_coverage BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_repository_state_insert AFTER INSERT ON repository_state BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_repository_state_update AFTER UPDATE ON repository_state BEGIN DELETE FROM active_history_pointer; END;
CREATE TRIGGER r011_invalidate_repository_state_delete AFTER DELETE ON repository_state BEGIN DELETE FROM active_history_pointer; END;
