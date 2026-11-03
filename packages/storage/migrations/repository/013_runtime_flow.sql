-- Additive only. Runtime flow records retain their activation and uncompressed steps.
CREATE TABLE runtime_flows (
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
  FOREIGN KEY(activation_id,entry_id) REFERENCES runtime_domain_facts(activation_id,entity_id)
) STRICT;
CREATE INDEX idx_runtime_flows_entry ON runtime_flows(activation_id,entry_id);
CREATE TABLE runtime_flow_steps (
  activation_id TEXT NOT NULL,
  flow_id TEXT NOT NULL,
  step_key TEXT NOT NULL CHECK(length(step_key)>0),
  ordinal INTEGER NOT NULL CHECK(ordinal>=0),
  context_id TEXT NOT NULL,
  schema_name TEXT NOT NULL CHECK(length(schema_name)>0),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  value_digest TEXT NOT NULL CHECK(length(value_digest)=64 AND value_digest NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY(activation_id,flow_id,step_key),
  UNIQUE(activation_id,flow_id,ordinal),
  FOREIGN KEY(activation_id,flow_id) REFERENCES runtime_flows(activation_id,entity_id),
  FOREIGN KEY(activation_id,context_id) REFERENCES execution_contexts(activation_id,entity_id)
) STRICT;
CREATE TRIGGER r013_immutable_runtime_flows_update BEFORE UPDATE ON runtime_flows BEGIN SELECT RAISE(ABORT,'R013_IMMUTABLE'); END;
CREATE TRIGGER r013_immutable_runtime_flows_delete BEFORE DELETE ON runtime_flows BEGIN SELECT RAISE(ABORT,'R013_IMMUTABLE'); END;
CREATE TRIGGER r013_immutable_runtime_flow_steps_update BEFORE UPDATE ON runtime_flow_steps BEGIN SELECT RAISE(ABORT,'R013_IMMUTABLE'); END;
CREATE TRIGGER r013_immutable_runtime_flow_steps_delete BEFORE DELETE ON runtime_flow_steps BEGIN SELECT RAISE(ABORT,'R013_IMMUTABLE'); END;
