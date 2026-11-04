-- Additive only. Original repository node references remain in the exact payload.
CREATE TABLE workspace_execution_nodes (
  activation_id TEXT NOT NULL,
  revision_set_id TEXT NOT NULL,
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  fact_key TEXT NOT NULL CHECK(length(fact_key)>0),
  repository_id TEXT NOT NULL,
  runtime_node_id TEXT NOT NULL CHECK(length(runtime_node_id)>0),
  schema_name TEXT NOT NULL CHECK(length(schema_name)>0),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  value_digest TEXT NOT NULL CHECK(length(value_digest)=64 AND value_digest NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY(activation_id,revision_set_id,entity_id),
  UNIQUE(activation_id,revision_set_id,fact_key),
  FOREIGN KEY(activation_id,revision_set_id) REFERENCES workspace_runtime_activations(id,revision_set_id),
  FOREIGN KEY(revision_set_id,repository_id) REFERENCES revision_set_items(revision_set_id,repository_id)
) STRICT;
CREATE TABLE workspace_execution_edges (
  activation_id TEXT NOT NULL,
  revision_set_id TEXT NOT NULL,
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  fact_key TEXT NOT NULL CHECK(length(fact_key)>0),
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  schema_name TEXT NOT NULL CHECK(length(schema_name)>0),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  value_digest TEXT NOT NULL CHECK(length(value_digest)=64 AND value_digest NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY(activation_id,revision_set_id,entity_id),
  UNIQUE(activation_id,revision_set_id,fact_key),
  FOREIGN KEY(activation_id,revision_set_id,source_id) REFERENCES workspace_execution_nodes(activation_id,revision_set_id,entity_id),
  FOREIGN KEY(activation_id,revision_set_id,target_id) REFERENCES workspace_execution_nodes(activation_id,revision_set_id,entity_id),
  FOREIGN KEY(activation_id,revision_set_id,match_id) REFERENCES contract_matches(activation_id,revision_set_id,entity_id)
) STRICT;
CREATE INDEX idx_workspace_edges_source ON workspace_execution_edges(activation_id,revision_set_id,source_id);
CREATE INDEX idx_workspace_edges_target ON workspace_execution_edges(activation_id,revision_set_id,target_id);
CREATE TRIGGER w006_immutable_workspace_execution_nodes_update BEFORE UPDATE ON workspace_execution_nodes BEGIN SELECT RAISE(ABORT,'W006_IMMUTABLE'); END;
CREATE TRIGGER w006_immutable_workspace_execution_nodes_delete BEFORE DELETE ON workspace_execution_nodes BEGIN SELECT RAISE(ABORT,'W006_IMMUTABLE'); END;
CREATE TRIGGER w006_immutable_workspace_execution_edges_update BEFORE UPDATE ON workspace_execution_edges BEGIN SELECT RAISE(ABORT,'W006_IMMUTABLE'); END;
CREATE TRIGGER w006_immutable_workspace_execution_edges_delete BEFORE DELETE ON workspace_execution_edges BEGIN SELECT RAISE(ABORT,'W006_IMMUTABLE'); END;
