-- Additive only. Frozen repository bindings are authenticated by the Store, never cross-database FKs.
CREATE TABLE workspace_runtime_activations (
  id TEXT PRIMARY KEY CHECK(length(id)>0),
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  revision_set_id TEXT NOT NULL,
  parent_id TEXT,
  input_digest TEXT NOT NULL CHECK(length(input_digest)=64 AND input_digest NOT GLOB '*[^0-9a-f]*'),
  candidate_digest TEXT NOT NULL CHECK(length(candidate_digest)=64 AND candidate_digest NOT GLOB '*[^0-9a-f]*'),
  schema_name TEXT NOT NULL CHECK(length(schema_name)>0),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  value_digest TEXT NOT NULL CHECK(length(value_digest)=64 AND value_digest NOT GLOB '*[^0-9a-f]*'),
  UNIQUE(id,revision_set_id),
  UNIQUE(workspace_id,id),
  UNIQUE(workspace_id,id,revision_set_id),
  CHECK(parent_id IS NULL OR parent_id<>id),
  FOREIGN KEY(workspace_id,revision_set_id) REFERENCES revision_sets(workspace_id,id),
  FOREIGN KEY(workspace_id,parent_id) REFERENCES workspace_runtime_activations(workspace_id,id)
) STRICT;
CREATE TRIGGER w005_require_frozen_revision_set BEFORE INSERT ON workspace_runtime_activations
WHEN NOT EXISTS(SELECT 1 FROM revision_sets WHERE id=NEW.revision_set_id AND workspace_id=NEW.workspace_id AND frozen=1)
BEGIN SELECT RAISE(ABORT,'WORKSPACE_RUNTIME_REQUIRES_FROZEN_SET'); END;
CREATE TABLE workspace_runtime_state (
  workspace_id TEXT PRIMARY KEY REFERENCES workspace(id),
  activation_id TEXT NOT NULL,
  revision_set_id TEXT NOT NULL,
  FOREIGN KEY(workspace_id,activation_id,revision_set_id) REFERENCES workspace_runtime_activations(workspace_id,id,revision_set_id)
) STRICT;
CREATE TABLE contracts (
  activation_id TEXT NOT NULL,
  revision_set_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  fact_key TEXT NOT NULL CHECK(length(fact_key)>0),
  service_id TEXT,
  schema_name TEXT NOT NULL CHECK(length(schema_name)>0),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  value_digest TEXT NOT NULL CHECK(length(value_digest)=64 AND value_digest NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY(activation_id,revision_set_id,repository_id,entity_id),
  UNIQUE(activation_id,revision_set_id,repository_id,fact_key),
  FOREIGN KEY(activation_id,revision_set_id) REFERENCES workspace_runtime_activations(id,revision_set_id),
  FOREIGN KEY(revision_set_id,repository_id) REFERENCES revision_set_items(revision_set_id,repository_id),
  FOREIGN KEY(activation_id,revision_set_id,service_id) REFERENCES services(activation_id,revision_set_id,entity_id)
) STRICT;
CREATE TABLE contract_matches (
  activation_id TEXT NOT NULL,
  revision_set_id TEXT NOT NULL,
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  fact_key TEXT NOT NULL CHECK(length(fact_key)>0),
  consumer_repository_id TEXT NOT NULL,
  consumer_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('MATCHED','AMBIGUOUS','UNRESOLVED','CONFLICTED','OUTSIDE_WORKSPACE','KNOWN_EXTERNAL')),
  selected_repository_id TEXT,
  selected_id TEXT,
  schema_name TEXT NOT NULL CHECK(length(schema_name)>0),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  value_digest TEXT NOT NULL CHECK(length(value_digest)=64 AND value_digest NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY(activation_id,revision_set_id,entity_id),
  UNIQUE(activation_id,revision_set_id,fact_key),
  UNIQUE(activation_id,revision_set_id,consumer_repository_id,consumer_id),
  FOREIGN KEY(activation_id,revision_set_id,consumer_repository_id,consumer_id) REFERENCES contracts(activation_id,revision_set_id,repository_id,entity_id),
  FOREIGN KEY(activation_id,revision_set_id,selected_repository_id,selected_id) REFERENCES contracts(activation_id,revision_set_id,repository_id,entity_id),
  CHECK((status='MATCHED' AND selected_repository_id IS NOT NULL AND selected_id IS NOT NULL) OR
    (status<>'MATCHED' AND selected_repository_id IS NULL AND selected_id IS NULL))
) STRICT;
CREATE TABLE match_candidates (
  activation_id TEXT NOT NULL,
  revision_set_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  provider_repository_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  PRIMARY KEY(activation_id,revision_set_id,match_id,provider_repository_id,provider_id),
  FOREIGN KEY(activation_id,revision_set_id,match_id) REFERENCES contract_matches(activation_id,revision_set_id,entity_id),
  FOREIGN KEY(activation_id,revision_set_id,provider_repository_id,provider_id) REFERENCES contracts(activation_id,revision_set_id,repository_id,entity_id)
) STRICT;
CREATE TRIGGER w005_immutable_workspace_runtime_activations_update BEFORE UPDATE ON workspace_runtime_activations BEGIN SELECT RAISE(ABORT,'W005_IMMUTABLE'); END;
CREATE TRIGGER w005_immutable_workspace_runtime_activations_delete BEFORE DELETE ON workspace_runtime_activations BEGIN SELECT RAISE(ABORT,'W005_IMMUTABLE'); END;
CREATE TRIGGER w005_immutable_contracts_update BEFORE UPDATE ON contracts BEGIN SELECT RAISE(ABORT,'W005_IMMUTABLE'); END;
CREATE TRIGGER w005_immutable_contracts_delete BEFORE DELETE ON contracts BEGIN SELECT RAISE(ABORT,'W005_IMMUTABLE'); END;
CREATE TRIGGER w005_immutable_contract_matches_update BEFORE UPDATE ON contract_matches BEGIN SELECT RAISE(ABORT,'W005_IMMUTABLE'); END;
CREATE TRIGGER w005_immutable_contract_matches_delete BEFORE DELETE ON contract_matches BEGIN SELECT RAISE(ABORT,'W005_IMMUTABLE'); END;
CREATE TRIGGER w005_immutable_match_candidates_update BEFORE UPDATE ON match_candidates BEGIN SELECT RAISE(ABORT,'W005_IMMUTABLE'); END;
CREATE TRIGGER w005_immutable_match_candidates_delete BEFORE DELETE ON match_candidates BEGIN SELECT RAISE(ABORT,'W005_IMMUTABLE'); END;
