CREATE TABLE canonical_nodes (
  revision_id TEXT NOT NULL,
  id TEXT NOT NULL CHECK (length(id) > 0),
  repository_id TEXT NOT NULL,
  fact_key TEXT NOT NULL CHECK (length(fact_key) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('REPOSITORY', 'MODULE', 'PACKAGE', 'TYPE', 'SYMBOL')),
  type_kind TEXT,
  symbol_kind TEXT,
  name TEXT NOT NULL CHECK (length(name) > 0),
  qualified_name TEXT,
  source_range_json TEXT CHECK (source_range_json IS NULL OR json_valid(source_range_json)),
  confidence_score REAL NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  confidence_method TEXT NOT NULL CHECK (length(confidence_method) > 0),
  confidence_reasons_json TEXT NOT NULL CHECK (json_valid(confidence_reasons_json) AND json_type(confidence_reasons_json) = 'array'),
  PRIMARY KEY (revision_id, id),
  FOREIGN KEY (repository_id, revision_id) REFERENCES revisions(repository_id, id) ON DELETE CASCADE,
  CHECK (
    (kind = 'TYPE' AND type_kind IN ('CLASS', 'INTERFACE', 'ENUM', 'RECORD', 'ANNOTATION', 'TRAIT', 'STRUCT', 'UNION', 'OTHER') AND symbol_kind IS NULL) OR
    (kind = 'SYMBOL' AND type_kind IS NULL AND symbol_kind IN ('METHOD', 'CONSTRUCTOR', 'FUNCTION', 'FIELD', 'PROPERTY', 'VARIABLE', 'PARAMETER', 'CONSTANT', 'OTHER')) OR
    (kind IN ('REPOSITORY', 'MODULE', 'PACKAGE') AND type_kind IS NULL AND symbol_kind IS NULL)
  )
) STRICT;

CREATE UNIQUE INDEX idx_canonical_nodes_fact_key ON canonical_nodes(revision_id, fact_key);
CREATE INDEX idx_canonical_nodes_kind ON canonical_nodes(repository_id, revision_id, kind);

CREATE TABLE canonical_edges (
  revision_id TEXT NOT NULL,
  id TEXT NOT NULL CHECK (length(id) > 0),
  repository_id TEXT NOT NULL,
  fact_key TEXT NOT NULL CHECK (length(fact_key) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('IMPORT', 'REFERENCE', 'CALL', 'INHERITANCE', 'OVERRIDE')),
  source_node_id TEXT NOT NULL,
  target_state TEXT NOT NULL CHECK (target_state IN ('RESOLVED', 'UNRESOLVED')),
  resolution TEXT NOT NULL CHECK (resolution IN ('EXACT', 'HEURISTIC', 'AMBIGUOUS', 'UNRESOLVED', 'UNSUPPORTED')),
  target_node_id TEXT,
  source_range_json TEXT CHECK (source_range_json IS NULL OR json_valid(source_range_json)),
  confidence_score REAL NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  confidence_method TEXT NOT NULL CHECK (length(confidence_method) > 0),
  confidence_reasons_json TEXT NOT NULL CHECK (json_valid(confidence_reasons_json) AND json_type(confidence_reasons_json) = 'array'),
  PRIMARY KEY (revision_id, id),
  FOREIGN KEY (repository_id, revision_id) REFERENCES revisions(repository_id, id) ON DELETE CASCADE,
  FOREIGN KEY (revision_id, source_node_id) REFERENCES canonical_nodes(revision_id, id),
  FOREIGN KEY (revision_id, target_node_id) REFERENCES canonical_nodes(revision_id, id),
  CHECK (
    (target_state = 'RESOLVED' AND resolution IN ('EXACT', 'HEURISTIC') AND target_node_id IS NOT NULL) OR
    (target_state = 'UNRESOLVED' AND resolution IN ('AMBIGUOUS', 'UNRESOLVED', 'UNSUPPORTED') AND target_node_id IS NULL)
  )
) STRICT;

CREATE UNIQUE INDEX idx_canonical_edges_fact_key ON canonical_edges(revision_id, fact_key);
CREATE INDEX idx_canonical_edges_source ON canonical_edges(revision_id, source_node_id, kind);
CREATE INDEX idx_canonical_edges_target ON canonical_edges(revision_id, target_node_id, kind);

CREATE TABLE unresolved_targets (
  revision_id TEXT NOT NULL,
  edge_id TEXT NOT NULL,
  original_hint TEXT NOT NULL CHECK (length(original_hint) > 0),
  candidates_json TEXT NOT NULL CHECK (json_valid(candidates_json) AND json_type(candidates_json) = 'array'),
  PRIMARY KEY (revision_id, edge_id),
  FOREIGN KEY (revision_id, edge_id) REFERENCES canonical_edges(revision_id, id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_unresolved_targets_hint ON unresolved_targets(original_hint);
