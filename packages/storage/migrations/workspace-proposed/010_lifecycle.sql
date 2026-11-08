CREATE UNIQUE INDEX proposed_documents_id_workspace ON documents(id,workspace_id);

CREATE TABLE compilation_input_snapshots (
  id TEXT NOT NULL CHECK(id IS NULL OR length(id)>0),
  workspace_id TEXT NOT NULL CHECK(workspace_id IS NULL OR length(workspace_id)>0),
  revision_set_id TEXT NOT NULL CHECK(revision_set_id IS NULL OR length(revision_set_id)>0),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  input_digest TEXT NOT NULL CHECK(length(input_digest)=64 AND input_digest NOT GLOB '*[^0-9a-f]*'),
  capture_started_at_ms INTEGER NOT NULL CHECK(capture_started_at_ms BETWEEN 0 AND 9007199254740991),
  capture_completed_at_ms INTEGER NOT NULL CHECK(capture_completed_at_ms BETWEEN 0 AND 9007199254740991),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  PRIMARY KEY(id),
  UNIQUE(workspace_id,id,revision_set_id),
  CHECK(capture_completed_at_ms>=capture_started_at_ms),
  FOREIGN KEY(workspace_id) REFERENCES workspace(id),
  FOREIGN KEY(workspace_id,revision_set_id) REFERENCES revision_sets(workspace_id,id)
) STRICT;

CREATE TABLE snapshot_supports (
  workspace_id TEXT NOT NULL CHECK(workspace_id IS NULL OR length(workspace_id)>0),
  snapshot_id TEXT NOT NULL CHECK(snapshot_id IS NULL OR length(snapshot_id)>0),
  revision_set_id TEXT NOT NULL CHECK(revision_set_id IS NULL OR length(revision_set_id)>0),
  support_key TEXT NOT NULL CHECK(support_key IS NULL OR length(support_key)>0),
  basis_key TEXT NOT NULL CHECK(basis_key IS NULL OR length(basis_key)>0),
  entity_key TEXT NOT NULL CHECK(entity_key IS NULL OR length(entity_key)>0),
  support_value_digest TEXT NOT NULL CHECK(length(support_value_digest)=64 AND support_value_digest NOT GLOB '*[^0-9a-f]*'),
  captured_value_digest TEXT NOT NULL CHECK(length(captured_value_digest)=64 AND captured_value_digest NOT GLOB '*[^0-9a-f]*'),
  value_schema_ref TEXT NOT NULL CHECK(value_schema_ref IS NULL OR length(value_schema_ref)>0),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  PRIMARY KEY(workspace_id,snapshot_id,support_key),
  UNIQUE(workspace_id,snapshot_id,basis_key,entity_key),
  FOREIGN KEY(workspace_id,snapshot_id,revision_set_id) REFERENCES compilation_input_snapshots(workspace_id,id,revision_set_id)
) STRICT;

CREATE TABLE compilation_runs (
  id TEXT NOT NULL CHECK(id IS NULL OR length(id)>0),
  workspace_id TEXT NOT NULL CHECK(workspace_id IS NULL OR length(workspace_id)>0),
  revision_set_id TEXT NOT NULL CHECK(revision_set_id IS NULL OR length(revision_set_id)>0),
  caller_subject_id TEXT NOT NULL CHECK(caller_subject_id IS NULL OR length(caller_subject_id)>0),
  request_key TEXT NOT NULL CHECK(request_key IS NULL OR length(request_key)>0),
  request_json TEXT NOT NULL CHECK(json_valid(request_json) AND json_type(request_json)='object'),
  state TEXT NOT NULL CHECK(state IS NULL OR length(state)>0),
  snapshot_id TEXT CHECK(snapshot_id IS NULL OR length(snapshot_id)>0),
  metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json) AND json_type(metadata_json)='object'),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms BETWEEN 0 AND 9007199254740991),
  finished_at_ms INTEGER CHECK(finished_at_ms IS NULL OR finished_at_ms BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(id),
  UNIQUE(workspace_id,caller_subject_id,request_key),
  UNIQUE(workspace_id,id,snapshot_id,revision_set_id),
  CHECK(state IN ('CREATED','CAPTURING','GENERATING','VALIDATING','READY','PUBLISHED','FAILED','CANCELLED')),
  CHECK(state<>'CREATED' OR snapshot_id IS NULL),
  CHECK(state NOT IN ('GENERATING','VALIDATING','READY','PUBLISHED') OR snapshot_id IS NOT NULL),
  CHECK((state IN ('PUBLISHED','FAILED','CANCELLED') AND finished_at_ms IS NOT NULL AND finished_at_ms>=created_at_ms) OR (state NOT IN ('PUBLISHED','FAILED','CANCELLED') AND finished_at_ms IS NULL)),
  FOREIGN KEY(workspace_id) REFERENCES workspace(id),
  FOREIGN KEY(workspace_id,revision_set_id) REFERENCES revision_sets(workspace_id,id),
  FOREIGN KEY(workspace_id,snapshot_id,revision_set_id) REFERENCES compilation_input_snapshots(workspace_id,id,revision_set_id)
) STRICT;

CREATE TABLE publication_runs (
  id TEXT NOT NULL CHECK(id IS NULL OR length(id)>0),
  workspace_id TEXT NOT NULL CHECK(workspace_id IS NULL OR length(workspace_id)>0),
  run_id TEXT NOT NULL CHECK(run_id IS NULL OR length(run_id)>0),
  snapshot_id TEXT NOT NULL CHECK(snapshot_id IS NULL OR length(snapshot_id)>0),
  revision_set_id TEXT NOT NULL CHECK(revision_set_id IS NULL OR length(revision_set_id)>0),
  expected_heads_json TEXT NOT NULL CHECK(json_valid(expected_heads_json) AND json_type(expected_heads_json)='object'),
  result_heads_json TEXT NOT NULL CHECK(json_valid(result_heads_json) AND json_type(result_heads_json)='object'),
  committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms BETWEEN 0 AND 9007199254740991),
  receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json) AND json_type(receipt_json)='object'),
  PRIMARY KEY(id),
  UNIQUE(workspace_id,run_id),
  FOREIGN KEY(workspace_id) REFERENCES workspace(id),
  FOREIGN KEY(workspace_id,run_id,snapshot_id,revision_set_id) REFERENCES compilation_runs(workspace_id,id,snapshot_id,revision_set_id)
) STRICT;

CREATE TABLE source_changes (
  id TEXT NOT NULL CHECK(id IS NULL OR length(id)>0),
  workspace_id TEXT NOT NULL CHECK(workspace_id IS NULL OR length(workspace_id)>0),
  basis_kind TEXT NOT NULL CHECK(basis_kind IS NULL OR length(basis_kind)>0),
  repository_id TEXT CHECK(repository_id IS NULL OR length(repository_id)>0),
  document_id TEXT CHECK(document_id IS NULL OR length(document_id)>0),
  before_basis_json TEXT CHECK(before_basis_json IS NULL OR (json_valid(before_basis_json) AND json_type(before_basis_json)='object')),
  after_basis_json TEXT CHECK(after_basis_json IS NULL OR (json_valid(after_basis_json) AND json_type(after_basis_json)='object')),
  observed_at_ms INTEGER NOT NULL CHECK(observed_at_ms BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(id),
  UNIQUE(workspace_id,id),
  CHECK(before_basis_json IS NOT NULL OR after_basis_json IS NOT NULL),
  CHECK((basis_kind='REPOSITORY' AND repository_id IS NOT NULL AND document_id IS NULL) OR (basis_kind='DOCUMENT' AND document_id IS NOT NULL AND repository_id IS NULL) OR (basis_kind='WORKSPACE' AND repository_id IS NULL AND document_id IS NULL)),
  FOREIGN KEY(workspace_id) REFERENCES workspace(id),
  FOREIGN KEY(repository_id,workspace_id) REFERENCES repositories(repository_id,workspace_id),
  FOREIGN KEY(document_id,workspace_id) REFERENCES documents(id,workspace_id)
) STRICT;

CREATE TABLE impacts (
  id TEXT NOT NULL CHECK(id IS NULL OR length(id)>0),
  workspace_id TEXT NOT NULL CHECK(workspace_id IS NULL OR length(workspace_id)>0),
  source_change_id TEXT NOT NULL CHECK(source_change_id IS NULL OR length(source_change_id)>0),
  knowledge_revision_id TEXT NOT NULL CHECK(knowledge_revision_id IS NULL OR length(knowledge_revision_id)>0),
  basis_key TEXT NOT NULL CHECK(basis_key IS NULL OR length(basis_key)>0),
  freshness TEXT NOT NULL CHECK(freshness IS NULL OR length(freshness)>0),
  reason_code TEXT NOT NULL CHECK(reason_code IS NULL OR length(reason_code)>0),
  observed_at_ms INTEGER NOT NULL CHECK(observed_at_ms BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(id),
  UNIQUE(workspace_id,source_change_id,knowledge_revision_id,basis_key),
  CHECK(freshness IN ('AFFECTED','STALE')),
  FOREIGN KEY(workspace_id) REFERENCES workspace(id),
  FOREIGN KEY(workspace_id,source_change_id) REFERENCES source_changes(workspace_id,id),
  FOREIGN KEY(workspace_id,knowledge_revision_id) REFERENCES knowledge_revisions(workspace_id,id)
) STRICT;

CREATE TRIGGER proposed_compilation_input_snapshots_no_update BEFORE UPDATE ON compilation_input_snapshots
BEGIN SELECT RAISE(ABORT,'immutable history'); END;
CREATE TRIGGER proposed_compilation_input_snapshots_no_delete BEFORE DELETE ON compilation_input_snapshots
BEGIN SELECT RAISE(ABORT,'immutable history'); END;

CREATE TRIGGER proposed_snapshot_supports_no_update BEFORE UPDATE ON snapshot_supports
BEGIN SELECT RAISE(ABORT,'immutable history'); END;
CREATE TRIGGER proposed_snapshot_supports_no_delete BEFORE DELETE ON snapshot_supports
BEGIN SELECT RAISE(ABORT,'immutable history'); END;

CREATE TRIGGER proposed_publication_runs_no_update BEFORE UPDATE ON publication_runs
BEGIN SELECT RAISE(ABORT,'immutable history'); END;
CREATE TRIGGER proposed_publication_runs_no_delete BEFORE DELETE ON publication_runs
BEGIN SELECT RAISE(ABORT,'immutable history'); END;

CREATE TRIGGER proposed_source_changes_no_update BEFORE UPDATE ON source_changes
BEGIN SELECT RAISE(ABORT,'immutable history'); END;
CREATE TRIGGER proposed_source_changes_no_delete BEFORE DELETE ON source_changes
BEGIN SELECT RAISE(ABORT,'immutable history'); END;

CREATE TRIGGER proposed_impacts_no_update BEFORE UPDATE ON impacts
BEGIN SELECT RAISE(ABORT,'immutable history'); END;
CREATE TRIGGER proposed_impacts_no_delete BEFORE DELETE ON impacts
BEGIN SELECT RAISE(ABORT,'immutable history'); END;

CREATE TRIGGER proposed_compilation_input_snapshots_frozen BEFORE INSERT ON compilation_input_snapshots
WHEN NOT EXISTS(SELECT 1 FROM revision_sets WHERE id=NEW.revision_set_id
  AND workspace_id=NEW.workspace_id AND frozen=1)
BEGIN SELECT RAISE(ABORT,'frozen revision set required'); END;

CREATE TRIGGER proposed_compilation_runs_frozen BEFORE INSERT ON compilation_runs
WHEN NOT EXISTS(SELECT 1 FROM revision_sets WHERE id=NEW.revision_set_id
  AND workspace_id=NEW.workspace_id AND frozen=1)
BEGIN SELECT RAISE(ABORT,'frozen revision set required'); END;

CREATE TRIGGER proposed_runs_created BEFORE INSERT ON compilation_runs
WHEN NEW.state<>'CREATED'
BEGIN SELECT RAISE(ABORT,'run must start CREATED'); END;
CREATE TRIGGER proposed_runs_no_delete BEFORE DELETE ON compilation_runs
BEGIN SELECT RAISE(ABORT,'immutable run'); END;
CREATE TRIGGER proposed_runs_fixed_request BEFORE UPDATE ON compilation_runs
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id
  OR NEW.revision_set_id IS NOT OLD.revision_set_id
  OR NEW.caller_subject_id IS NOT OLD.caller_subject_id
  OR NEW.request_key IS NOT OLD.request_key OR NEW.request_json IS NOT OLD.request_json
  OR NEW.created_at_ms IS NOT OLD.created_at_ms
BEGIN SELECT RAISE(ABORT,'immutable run request'); END;
CREATE TRIGGER proposed_runs_terminal BEFORE UPDATE ON compilation_runs
WHEN OLD.state IN ('PUBLISHED','FAILED','CANCELLED')
BEGIN SELECT RAISE(ABORT,'terminal run'); END;
CREATE TRIGGER proposed_runs_snapshot_once BEFORE UPDATE ON compilation_runs
WHEN (OLD.snapshot_id IS NOT NULL AND NEW.snapshot_id IS NOT OLD.snapshot_id)
 OR (OLD.snapshot_id IS NULL AND NEW.snapshot_id IS NOT NULL
     AND NOT(OLD.state='CAPTURING' AND NEW.state='CAPTURING'))
BEGIN SELECT RAISE(ABORT,'snapshot binding is one-shot'); END;
CREATE TRIGGER proposed_runs_transition BEFORE UPDATE ON compilation_runs
WHEN NOT(NEW.state=OLD.state
 OR (OLD.state='CREATED' AND NEW.state='CAPTURING')
 OR (OLD.state='CAPTURING' AND OLD.snapshot_id IS NOT NULL AND NEW.state='GENERATING')
 OR (OLD.state='GENERATING' AND NEW.state='VALIDATING')
 OR (OLD.state='VALIDATING' AND NEW.state='READY')
 OR (OLD.state='READY' AND NEW.state='PUBLISHED')
 OR NEW.state IN ('FAILED','CANCELLED'))
BEGIN SELECT RAISE(ABORT,'invalid run transition'); END;

-- Reject every declared duplicate key before conflict replacement can delete history.
CREATE TRIGGER proposed_compilation_input_snapshots_no_duplicate_insert BEFORE INSERT ON compilation_input_snapshots
WHEN EXISTS(SELECT 1 FROM compilation_input_snapshots WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'duplicate immutable key'); END;
CREATE TRIGGER proposed_snapshot_supports_no_duplicate_insert BEFORE INSERT ON snapshot_supports
WHEN EXISTS(SELECT 1 FROM snapshot_supports WHERE workspace_id=NEW.workspace_id AND snapshot_id=NEW.snapshot_id AND (support_key=NEW.support_key OR (basis_key=NEW.basis_key AND entity_key=NEW.entity_key)))
BEGIN SELECT RAISE(ABORT,'duplicate immutable key'); END;
CREATE TRIGGER proposed_compilation_runs_no_duplicate_insert BEFORE INSERT ON compilation_runs
WHEN EXISTS(SELECT 1 FROM compilation_runs WHERE id=NEW.id OR (workspace_id=NEW.workspace_id AND caller_subject_id=NEW.caller_subject_id AND request_key=NEW.request_key))
BEGIN SELECT RAISE(ABORT,'duplicate immutable key'); END;
CREATE TRIGGER proposed_publication_runs_no_duplicate_insert BEFORE INSERT ON publication_runs
WHEN EXISTS(SELECT 1 FROM publication_runs WHERE id=NEW.id OR (workspace_id=NEW.workspace_id AND run_id=NEW.run_id))
BEGIN SELECT RAISE(ABORT,'duplicate immutable key'); END;
CREATE TRIGGER proposed_source_changes_no_duplicate_insert BEFORE INSERT ON source_changes
WHEN EXISTS(SELECT 1 FROM source_changes WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'duplicate immutable key'); END;
CREATE TRIGGER proposed_impacts_no_duplicate_insert BEFORE INSERT ON impacts
WHEN EXISTS(SELECT 1 FROM impacts WHERE id=NEW.id OR (workspace_id=NEW.workspace_id AND source_change_id=NEW.source_change_id AND knowledge_revision_id=NEW.knowledge_revision_id AND basis_key=NEW.basis_key))
BEGIN SELECT RAISE(ABORT,'duplicate immutable key'); END;
