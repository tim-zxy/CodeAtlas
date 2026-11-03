-- Additive only. No backfill, old-row conversion, or down migration.
CREATE TABLE runtime_activations (
  id TEXT PRIMARY KEY CHECK(length(id)>0),
  repository_id TEXT NOT NULL REFERENCES repository(id),
  revision_id TEXT NOT NULL,
  parent_id TEXT,
  syntax_activation_id TEXT NOT NULL,
  code_basis_json TEXT NOT NULL CHECK(json_valid(code_basis_json) AND json_type(code_basis_json)='object'),
  syntax_membership_digest TEXT NOT NULL CHECK(length(syntax_membership_digest)=64 AND syntax_membership_digest NOT GLOB '*[^0-9a-f]*'),
  policy_digest TEXT NOT NULL CHECK(length(policy_digest)=64 AND policy_digest NOT GLOB '*[^0-9a-f]*'),
  candidate_digest TEXT NOT NULL CHECK(length(candidate_digest)=64 AND candidate_digest NOT GLOB '*[^0-9a-f]*'),
  schema_name TEXT NOT NULL CHECK(length(schema_name)>0),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  value_digest TEXT NOT NULL CHECK(length(value_digest)=64 AND value_digest NOT GLOB '*[^0-9a-f]*'),
  UNIQUE(repository_id,id),
  CHECK(parent_id IS NULL OR parent_id<>id),
  FOREIGN KEY(repository_id,revision_id) REFERENCES revisions(repository_id,id),
  FOREIGN KEY(repository_id,parent_id) REFERENCES runtime_activations(repository_id,id),
  FOREIGN KEY(repository_id,syntax_activation_id) REFERENCES activation_history(repository_id,id)
) STRICT;
CREATE TABLE runtime_state (
  repository_id TEXT PRIMARY KEY REFERENCES repository(id),
  activation_id TEXT NOT NULL,
  FOREIGN KEY(repository_id,activation_id) REFERENCES runtime_activations(repository_id,id)
) STRICT;
CREATE TABLE runtime_domain_facts (
  activation_id TEXT NOT NULL,
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  fact_key TEXT NOT NULL CHECK(length(fact_key)>0),
  kind TEXT NOT NULL CHECK(kind IN ('ENTRY_POINT','TASK_DEFINITION','DATA_RESOURCE','DATA_CHANGE_TRIGGER','CONTRACT')),
  schema_name TEXT NOT NULL CHECK(length(schema_name)>0),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  value_digest TEXT NOT NULL CHECK(length(value_digest)=64 AND value_digest NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY(activation_id,entity_id),
  UNIQUE(activation_id,kind,fact_key),
  UNIQUE(activation_id,kind,entity_id),
  FOREIGN KEY(activation_id) REFERENCES runtime_activations(id)
) STRICT;
CREATE TABLE runtime_bindings (
  activation_id TEXT NOT NULL,
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  fact_key TEXT NOT NULL CHECK(length(fact_key)>0),
  kind TEXT NOT NULL CHECK(kind IN ('MESSAGE_PUBLISH','MESSAGE_CONSUME','HTTP_CALL','DATA_READ','DATA_WRITE','DATA_WATCH','TASK_CREATE','TASK_EXECUTE','DEPENDENCY')),
  owner_ref_json TEXT NOT NULL CHECK(json_valid(owner_ref_json) AND json_type(owner_ref_json)='object'),
  target_kind TEXT,
  target_id TEXT,
  dependency_ref_json TEXT CHECK(dependency_ref_json IS NULL OR (json_valid(dependency_ref_json) AND json_type(dependency_ref_json)='object')),
  handler_ref_json TEXT CHECK(handler_ref_json IS NULL OR (json_valid(handler_ref_json) AND json_type(handler_ref_json)='object')),
  schema_name TEXT NOT NULL CHECK(length(schema_name)>0),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  value_digest TEXT NOT NULL CHECK(length(value_digest)=64 AND value_digest NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY(activation_id,entity_id),
  UNIQUE(activation_id,kind,fact_key),
  FOREIGN KEY(activation_id) REFERENCES runtime_activations(id),
  FOREIGN KEY(activation_id,target_kind,target_id) REFERENCES runtime_domain_facts(activation_id,kind,entity_id),
  CHECK((kind='DEPENDENCY' AND target_kind IS NULL AND target_id IS NULL AND dependency_ref_json IS NOT NULL) OR
    (kind<>'DEPENDENCY' AND target_kind IS NOT NULL AND target_id IS NOT NULL AND dependency_ref_json IS NULL)),
  CHECK((kind IN ('MESSAGE_PUBLISH','MESSAGE_CONSUME','HTTP_CALL') AND target_kind='CONTRACT') OR
    (kind IN ('DATA_READ','DATA_WRITE','DATA_WATCH') AND target_kind='DATA_RESOURCE') OR
    (kind IN ('TASK_CREATE','TASK_EXECUTE') AND target_kind='TASK_DEFINITION') OR kind='DEPENDENCY'),
  CHECK((kind='DATA_WATCH' AND handler_ref_json IS NOT NULL) OR (kind<>'DATA_WATCH' AND handler_ref_json IS NULL))
) STRICT;
CREATE TABLE runtime_support_membership (
  activation_id TEXT NOT NULL REFERENCES runtime_activations(id),
  support_key TEXT NOT NULL CHECK(length(support_key)>0),
  original_basis_json TEXT NOT NULL CHECK(json_valid(original_basis_json) AND json_type(original_basis_json)='object'),
  support_ref_json TEXT NOT NULL CHECK(json_valid(support_ref_json) AND json_type(support_ref_json)='object'),
  schema_name TEXT NOT NULL CHECK(length(schema_name)>0),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  value_digest TEXT NOT NULL CHECK(length(value_digest)=64 AND value_digest NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY(activation_id,support_key)
) STRICT;
CREATE TABLE execution_contexts (
  activation_id TEXT NOT NULL,
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  fact_key TEXT NOT NULL CHECK(length(fact_key)>0),
  entry_id TEXT NOT NULL,
  schema_name TEXT NOT NULL CHECK(length(schema_name)>0),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  value_digest TEXT NOT NULL CHECK(length(value_digest)=64 AND value_digest NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY(activation_id,entity_id),
  UNIQUE(activation_id,fact_key),
  FOREIGN KEY(activation_id) REFERENCES runtime_activations(id),
  FOREIGN KEY(activation_id,entry_id) REFERENCES runtime_domain_facts(activation_id,entity_id)
) STRICT;
CREATE TABLE execution_nodes (
  activation_id TEXT NOT NULL,
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  fact_key TEXT NOT NULL CHECK(length(fact_key)>0),
  context_id TEXT NOT NULL,
  schema_name TEXT NOT NULL CHECK(length(schema_name)>0),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  value_digest TEXT NOT NULL CHECK(length(value_digest)=64 AND value_digest NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY(activation_id,entity_id),
  UNIQUE(activation_id,fact_key),
  UNIQUE(activation_id,context_id,entity_id),
  FOREIGN KEY(activation_id,context_id) REFERENCES execution_contexts(activation_id,entity_id)
) STRICT;
CREATE INDEX idx_execution_nodes_context ON execution_nodes(activation_id,context_id);
CREATE TABLE execution_edges (
  activation_id TEXT NOT NULL,
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  fact_key TEXT NOT NULL CHECK(length(fact_key)>0),
  context_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_id TEXT,
  target_resolution TEXT NOT NULL CHECK(target_resolution IN ('RESOLVED','NON_RESOLVED')),
  schema_name TEXT NOT NULL CHECK(length(schema_name)>0),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  value_digest TEXT NOT NULL CHECK(length(value_digest)=64 AND value_digest NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY(activation_id,entity_id),
  UNIQUE(activation_id,fact_key),
  FOREIGN KEY(activation_id,context_id) REFERENCES execution_contexts(activation_id,entity_id),
  FOREIGN KEY(activation_id,context_id,source_id) REFERENCES execution_nodes(activation_id,context_id,entity_id),
  FOREIGN KEY(activation_id,target_id) REFERENCES execution_nodes(activation_id,entity_id),
  CHECK((target_resolution='RESOLVED' AND target_id IS NOT NULL) OR (target_resolution='NON_RESOLVED' AND target_id IS NULL))
) STRICT;
CREATE INDEX idx_execution_edges_source ON execution_edges(activation_id,source_id);
CREATE INDEX idx_execution_edges_target ON execution_edges(activation_id,target_id);
CREATE TRIGGER r012_immutable_runtime_activations_update BEFORE UPDATE ON runtime_activations BEGIN SELECT RAISE(ABORT,'R012_IMMUTABLE'); END;
CREATE TRIGGER r012_immutable_runtime_activations_delete BEFORE DELETE ON runtime_activations BEGIN SELECT RAISE(ABORT,'R012_IMMUTABLE'); END;
CREATE TRIGGER r012_immutable_runtime_domain_facts_update BEFORE UPDATE ON runtime_domain_facts BEGIN SELECT RAISE(ABORT,'R012_IMMUTABLE'); END;
CREATE TRIGGER r012_immutable_runtime_domain_facts_delete BEFORE DELETE ON runtime_domain_facts BEGIN SELECT RAISE(ABORT,'R012_IMMUTABLE'); END;
CREATE TRIGGER r012_immutable_runtime_bindings_update BEFORE UPDATE ON runtime_bindings BEGIN SELECT RAISE(ABORT,'R012_IMMUTABLE'); END;
CREATE TRIGGER r012_immutable_runtime_bindings_delete BEFORE DELETE ON runtime_bindings BEGIN SELECT RAISE(ABORT,'R012_IMMUTABLE'); END;
CREATE TRIGGER r012_immutable_runtime_support_membership_update BEFORE UPDATE ON runtime_support_membership BEGIN SELECT RAISE(ABORT,'R012_IMMUTABLE'); END;
CREATE TRIGGER r012_immutable_runtime_support_membership_delete BEFORE DELETE ON runtime_support_membership BEGIN SELECT RAISE(ABORT,'R012_IMMUTABLE'); END;
CREATE TRIGGER r012_immutable_execution_contexts_update BEFORE UPDATE ON execution_contexts BEGIN SELECT RAISE(ABORT,'R012_IMMUTABLE'); END;
CREATE TRIGGER r012_immutable_execution_contexts_delete BEFORE DELETE ON execution_contexts BEGIN SELECT RAISE(ABORT,'R012_IMMUTABLE'); END;
CREATE TRIGGER r012_immutable_execution_nodes_update BEFORE UPDATE ON execution_nodes BEGIN SELECT RAISE(ABORT,'R012_IMMUTABLE'); END;
CREATE TRIGGER r012_immutable_execution_nodes_delete BEFORE DELETE ON execution_nodes BEGIN SELECT RAISE(ABORT,'R012_IMMUTABLE'); END;
CREATE TRIGGER r012_immutable_execution_edges_update BEFORE UPDATE ON execution_edges BEGIN SELECT RAISE(ABORT,'R012_IMMUTABLE'); END;
CREATE TRIGGER r012_immutable_execution_edges_delete BEFORE DELETE ON execution_edges BEGIN SELECT RAISE(ABORT,'R012_IMMUTABLE'); END;
