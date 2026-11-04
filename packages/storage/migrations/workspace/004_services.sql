-- Additive only. W005 supplies the referenced activation table before publication.
CREATE UNIQUE INDEX idx_revision_sets_workspace_id ON revision_sets(workspace_id,id);
CREATE TABLE services (
  activation_id TEXT NOT NULL,
  revision_set_id TEXT NOT NULL,
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  fact_key TEXT NOT NULL CHECK(length(fact_key)>0),
  logical_service_key TEXT NOT NULL CHECK(length(logical_service_key)>0),
  location TEXT NOT NULL CHECK(location IN ('WORKSPACE','OUTSIDE_WORKSPACE','KNOWN_EXTERNAL')),
  repository_id TEXT,
  schema_name TEXT NOT NULL CHECK(length(schema_name)>0),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  value_digest TEXT NOT NULL CHECK(length(value_digest)=64 AND value_digest NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY(activation_id,revision_set_id,entity_id),
  UNIQUE(activation_id,revision_set_id,fact_key),
  FOREIGN KEY(activation_id,revision_set_id) REFERENCES workspace_runtime_activations(id,revision_set_id),
  CHECK((location='WORKSPACE' AND repository_id IS NOT NULL) OR (location<>'WORKSPACE' AND repository_id IS NULL))
) STRICT;
CREATE TABLE service_identities (
  activation_id TEXT NOT NULL,
  revision_set_id TEXT NOT NULL,
  entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
  fact_key TEXT NOT NULL CHECK(length(fact_key)>0),
  service_id TEXT NOT NULL,
  identity_kind TEXT NOT NULL CHECK(identity_kind IN ('LOGICAL_SERVICE','HTTP_ORIGIN','MESSAGE_NAMESPACE')),
  namespace TEXT NOT NULL CHECK(length(namespace)>0),
  identity_key TEXT NOT NULL CHECK(length(identity_key)>0),
  schema_name TEXT NOT NULL CHECK(length(schema_name)>0),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
  value_digest TEXT NOT NULL CHECK(length(value_digest)=64 AND value_digest NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY(activation_id,revision_set_id,entity_id),
  UNIQUE(activation_id,revision_set_id,fact_key),
  FOREIGN KEY(activation_id,revision_set_id,service_id) REFERENCES services(activation_id,revision_set_id,entity_id)
) STRICT;
CREATE INDEX idx_service_identity_lookup ON service_identities(activation_id,revision_set_id,identity_kind,namespace,identity_key);
CREATE TRIGGER w004_immutable_services_update BEFORE UPDATE ON services BEGIN SELECT RAISE(ABORT,'W004_IMMUTABLE'); END;
CREATE TRIGGER w004_immutable_services_delete BEFORE DELETE ON services BEGIN SELECT RAISE(ABORT,'W004_IMMUTABLE'); END;
CREATE TRIGGER w004_immutable_service_identities_update BEFORE UPDATE ON service_identities BEGIN SELECT RAISE(ABORT,'W004_IMMUTABLE'); END;
CREATE TRIGGER w004_immutable_service_identities_delete BEFORE DELETE ON service_identities BEGIN SELECT RAISE(ABORT,'W004_IMMUTABLE'); END;
