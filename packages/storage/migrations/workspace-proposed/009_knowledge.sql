CREATE TABLE knowledge_items (
  id TEXT NOT NULL CHECK(id IS NULL OR length(id)>0),
  workspace_id TEXT NOT NULL CHECK(workspace_id IS NULL OR length(workspace_id)>0),
  type TEXT NOT NULL CHECK(type IS NULL OR length(type)>0),
  scope_json TEXT NOT NULL CHECK(json_valid(scope_json) AND json_type(scope_json)='object'),
  importance TEXT NOT NULL CHECK(importance IS NULL OR length(importance)>0),
  lifecycle_state TEXT NOT NULL CHECK(lifecycle_state IS NULL OR length(lifecycle_state)>0),
  published_revision_id TEXT CHECK(published_revision_id IS NULL OR length(published_revision_id)>0),
  source_freshness TEXT NOT NULL CHECK(source_freshness IS NULL OR length(source_freshness)>0),
  compilation_currency TEXT NOT NULL CHECK(compilation_currency IS NULL OR length(compilation_currency)>0),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  PRIMARY KEY(id),
  UNIQUE(workspace_id,id),
  CHECK(type IN ('COMPONENT','CAPABILITY','RUNTIME_FLOW_REFERENCE','BUSINESS_FLOW','INTEGRATION')),
  CHECK(lifecycle_state IN ('DRAFT','ACTIVE','DEPRECATED','SUPERSEDED','ARCHIVED')),
  CHECK(source_freshness IN ('FRESH','AFFECTED','STALE')),
  CHECK(compilation_currency IN ('CURRENT','OUTDATED_WORKFLOW','OUTDATED_PROMPT','OUTDATED_MODEL_POLICY')),
  CHECK(lifecycle_state<>'DRAFT' OR published_revision_id IS NULL),
  CHECK(lifecycle_state<>'ACTIVE' OR published_revision_id IS NOT NULL),
  FOREIGN KEY(workspace_id) REFERENCES workspace(id),
  FOREIGN KEY(workspace_id,id,published_revision_id) REFERENCES knowledge_revisions(workspace_id,item_id,id) DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE knowledge_revisions (
  id TEXT NOT NULL CHECK(id IS NULL OR length(id)>0),
  workspace_id TEXT NOT NULL CHECK(workspace_id IS NULL OR length(workspace_id)>0),
  item_id TEXT NOT NULL CHECK(item_id IS NULL OR length(item_id)>0),
  previous_id TEXT CHECK(previous_id IS NULL OR length(previous_id)>0),
  revision_set_id TEXT NOT NULL CHECK(revision_set_id IS NULL OR length(revision_set_id)>0),
  semantic_fingerprint TEXT NOT NULL CHECK(length(semantic_fingerprint)=64 AND semantic_fingerprint NOT GLOB '*[^0-9a-f]*'),
  presentation_fingerprint TEXT NOT NULL CHECK(length(presentation_fingerprint)=64 AND presentation_fingerprint NOT GLOB '*[^0-9a-f]*'),
  input_snapshot_id TEXT NOT NULL CHECK(input_snapshot_id IS NULL OR length(input_snapshot_id)>0),
  compilation_run_id TEXT NOT NULL CHECK(compilation_run_id IS NULL OR length(compilation_run_id)>0),
  evaluation_id TEXT NOT NULL CHECK(evaluation_id IS NULL OR length(evaluation_id)>0),
  publication_state TEXT NOT NULL CHECK(publication_state IS NULL OR length(publication_state)>0),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms BETWEEN 0 AND 9007199254740991),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  PRIMARY KEY(id),
  UNIQUE(workspace_id,id),
  UNIQUE(workspace_id,item_id,id),
  UNIQUE(workspace_id,id,compilation_run_id,input_snapshot_id,evaluation_id,revision_set_id),
  CHECK(previous_id IS NULL OR previous_id<>id),
  CHECK(publication_state IN ('CANDIDATE','VALIDATED','PUBLISHED','REJECTED')),
  FOREIGN KEY(workspace_id) REFERENCES workspace(id),
  FOREIGN KEY(workspace_id,item_id) REFERENCES knowledge_items(workspace_id,id),
  FOREIGN KEY(workspace_id,item_id,previous_id) REFERENCES knowledge_revisions(workspace_id,item_id,id),
  FOREIGN KEY(workspace_id,revision_set_id) REFERENCES revision_sets(workspace_id,id)
) STRICT;

CREATE TABLE knowledge_relations (
  workspace_id TEXT NOT NULL CHECK(workspace_id IS NULL OR length(workspace_id)>0),
  revision_id TEXT NOT NULL CHECK(revision_id IS NULL OR length(revision_id)>0),
  ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 0 AND 9007199254740991),
  kind TEXT NOT NULL CHECK(kind IS NULL OR length(kind)>0),
  target_ref_json TEXT NOT NULL CHECK(json_valid(target_ref_json) AND json_type(target_ref_json)='object'),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  PRIMARY KEY(workspace_id,revision_id,ordinal),
  FOREIGN KEY(workspace_id,revision_id) REFERENCES knowledge_revisions(workspace_id,id)
) STRICT;

CREATE TRIGGER proposed_knowledge_revisions_no_update BEFORE UPDATE ON knowledge_revisions
BEGIN SELECT RAISE(ABORT,'immutable history'); END;
CREATE TRIGGER proposed_knowledge_revisions_no_delete BEFORE DELETE ON knowledge_revisions
BEGIN SELECT RAISE(ABORT,'immutable history'); END;

CREATE TRIGGER proposed_knowledge_relations_no_update BEFORE UPDATE ON knowledge_relations
BEGIN SELECT RAISE(ABORT,'immutable history'); END;
CREATE TRIGGER proposed_knowledge_relations_no_delete BEFORE DELETE ON knowledge_relations
BEGIN SELECT RAISE(ABORT,'immutable history'); END;

CREATE TRIGGER proposed_knowledge_revisions_frozen BEFORE INSERT ON knowledge_revisions
WHEN NOT EXISTS(SELECT 1 FROM revision_sets WHERE id=NEW.revision_set_id
  AND workspace_id=NEW.workspace_id AND frozen=1)
BEGIN SELECT RAISE(ABORT,'frozen revision set required'); END;

CREATE TRIGGER proposed_items_no_delete BEFORE DELETE ON knowledge_items BEGIN SELECT RAISE(ABORT,'immutable item identity'); END;
CREATE TRIGGER proposed_items_fixed_identity BEFORE UPDATE ON knowledge_items
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id
  OR NEW.type IS NOT OLD.type OR NEW.scope_json IS NOT OLD.scope_json
BEGIN SELECT RAISE(ABORT,'immutable item identity'); END;

-- Reject every declared duplicate key before conflict replacement can delete history.
CREATE TRIGGER proposed_knowledge_items_no_duplicate_insert BEFORE INSERT ON knowledge_items
WHEN EXISTS(SELECT 1 FROM knowledge_items WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'duplicate immutable key'); END;
CREATE TRIGGER proposed_knowledge_revisions_no_duplicate_insert BEFORE INSERT ON knowledge_revisions
WHEN EXISTS(SELECT 1 FROM knowledge_revisions WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'duplicate immutable key'); END;
CREATE TRIGGER proposed_knowledge_relations_no_duplicate_insert BEFORE INSERT ON knowledge_relations
WHEN EXISTS(SELECT 1 FROM knowledge_relations WHERE workspace_id=NEW.workspace_id AND revision_id=NEW.revision_id AND ordinal=NEW.ordinal)
BEGIN SELECT RAISE(ABORT,'duplicate immutable key'); END;
