# W009-W011 physical schema review candidate

Status: **PROPOSED / TEST-OWNED EXPERIMENT ONLY / NOT APPROVED FOR INSTALLATION**.
These SQL blocks are candidate text under docs, not migration files or manifest
entries. W009/W010 are exercised only in isolated owned tests; no user database,
production writer or new production reader admission is enabled. W011 remains
conditional and unexecuted. All physical choices are N; existing IR invariants are F.
Controlling discussion: [policy/lifecycle decision packet](2026-11-07-policy-lifecycle-decision-proposal.md).

W009/W010 below make the physical choices concrete for review. They are not a
complete adoptable release: relation projection, actual writer authority, named
reader admission and W011 production Evaluation remain unresolved. No SQL shape
or PASS label authenticates a producer or grants publication. W011 is deliberately
not faked using the existing fixture/oracle report.

## W009 candidate

Full item/revision v1 envelopes live in canonical payload_json; headers must match
strict parsed payloads exactly. Input snapshot/run/evaluation identifiers are TEXT
forward references at W009, not FKs to nonexistent future tables. Relation rows
propose only exact ComponentContent.relationships projection with ordinal order;
no invented relation kinds or UNIQUE(kind,target). This projection needs approval.
Full payload/header validation must also enforce the locked snapshot reference
kind/id with revisionId omitted; a syntactically valid EntityRef is not a record
credential. No record is published merely because SQL allows an insert.

```sql
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
```

## W010 candidate

Existing parent keys: W004 revision_sets(workspace_id,id), W007 repositories
(repository_id,workspace_id). W010 adds the exact documents(id,workspace_id) parent.
All snapshot/support payload bytes must equal C(the fully validated object), with
full membership/header agreement and original SupportRef digest verification;
SQL constraints do not replace that validation. No UNIQUE(input_digest).
The first proposed writer exposes capture only; model/publication/source-event
writers remain disabled despite future state/table vocabulary being present.

```sql
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
```

## W011: required key interface, not an invented Evaluation implementation

The current packages/evaluation/src/phase1-report.ts is fixture/oracle evaluation:
fixtureId, manifestDigest, expectedDigest and execution obligations. It has no
workspace/run/snapshot binding or production Knowledge publication admission.
Its identity.inputDigest cannot simply be relabelled snapshot.inputDigest.

Required future evaluation parent key is
(workspace_id,id,run_id,snapshot_id,revision_set_id), with an actual producer/strict
persisted schema and actual quality admission still to decide. Storage cannot
import Evaluation under the architecture; choose and approve validation ownership
(shared IR validator or genuine Application issuer plus strict Storage validation).
No generic JSON wrapper/PASS row/empty obligations supplies that missing contract.

The exact proposed provenance relation, conditional on that real parent, is:

```sql
-- NOT INSTALLABLE: evaluation_runs producer/schema/admission are not defined.
CREATE TABLE knowledge_revision_provenance (
  workspace_id TEXT NOT NULL CHECK(length(workspace_id)>0),
  revision_id TEXT NOT NULL CHECK(length(revision_id)>0),
  run_id TEXT NOT NULL CHECK(length(run_id)>0),
  snapshot_id TEXT NOT NULL CHECK(length(snapshot_id)>0),
  evaluation_id TEXT NOT NULL CHECK(length(evaluation_id)>0),
  revision_set_id TEXT NOT NULL CHECK(length(revision_set_id)>0),
  PRIMARY KEY(workspace_id,revision_id),
  FOREIGN KEY(workspace_id,revision_id,run_id,snapshot_id,evaluation_id,revision_set_id)
    REFERENCES knowledge_revisions(workspace_id,id,compilation_run_id,input_snapshot_id,evaluation_id,revision_set_id),
  FOREIGN KEY(workspace_id,run_id,snapshot_id,revision_set_id)
    REFERENCES compilation_runs(workspace_id,id,snapshot_id,revision_set_id),
  FOREIGN KEY(workspace_id,snapshot_id,revision_set_id)
    REFERENCES compilation_input_snapshots(workspace_id,id,revision_set_id),
  FOREIGN KEY(workspace_id,evaluation_id,run_id,snapshot_id,revision_set_id)
    REFERENCES evaluation_runs(workspace_id,id,run_id,snapshot_id,revision_set_id)
) STRICT;
```

Future eval/probe/metric/provenance are append-only. RATIO observed=false is a real
existing FAIL outcome and must not be coerced to REAL0; null counts/thresholds stay
null. Actual published-pointer guards are added only with full W011 and check
same-item PUBLISHED revision, exact provenance and real publication receipt/head
membership. Before then, publication is SCHEMA_CAPABILITY_UNAVAILABLE.

## Reader compatibility and failure disposition

Current DocumentStore admits workspace7/8 only; ContractStore and combined
selectors admit6/7/8. A W009 installation without corresponding named9/10/11 readers
breaks existing access by design. Any approval must include exact new header/FK/
shape checks and old-head/read/rollback regressions. Never replace admission by
>=, and do not confuse workspace10 with the repo schema10 code-context API.

| Actual event | Confirmed state and action |
| --- | --- |
| Any pending backupRequired=true | Original runner rejects entire batch before W009; no manual backup receipt bypass. |
| W009 fails and rollback succeeds | Remain8; stop. |
| W009 commits, W010 fails/rolls back | Remain9; keep W009; no downgrade/checksum edit/publication. |
| W009/W010 commit, W011 fails/rolls back | Remain10; snapshot history remains; publication closed. |
| COMMIT acknowledgement fails | Commit may exist; settle original owner then inspect real schema/rows, no blind replay. |
| Rollback/close/owner state uncertain | UNKNOWN; stop later writes, never edit user_version to pretend recovery. |
| All schemas installed | Schema only; actual authorization/Source/scan/Evaluation/publication gates still required. |

Each migration has its own BEGIN IMMEDIATE via the original runner. All-false
backupRequired needs exact per-migration approval and owned upgrade/fault evidence;
any true waits for separately approved real backup orchestration. Disabling the
writer is functional rollback; history deletion, schema downgrade and restoring a
backup are separate actions, not implicit repair.

The closed inspection union and sole-writer/restart proof are in the decision
packet. Absence/null does not prove NOT_COMMITTED while an old writer could still
commit; re-opening a DB or a timeout wrapper finishing supplies no settlement.

Review decisions still required: W009 relation projection and writer policies;
complete request/metadata/receipt/subject/sole-writer contract; real production
Evaluation identity/validator/quality boundary; exact9/10/11 reader admission;
per-migration backup choices. Do not install this candidate or enable any writer.

## Closed inspection contract and restart proof candidate

Proposed inspection returns record-commit facts only, after current read authority
and full run/request/snapshot/support verification. It never reports reused:

```ts
type SnapshotInspection =
  | {
      status: 'COMMITTED';
      workspaceId: EntityId;
      runId: EntityId;
      snapshotId: EntityId;
      revisionSetId: EntityId;
      inputDigest: Phase1Digest;
    }
  | {
      status: 'NOT_COMMITTED';
      workspaceId: EntityId;
      runId: EntityId;
      attemptedSnapshotId: EntityId;
    }
  | {
      status: 'COMMIT_OUTCOME_UNKNOWN';
      workspaceId: EntityId;
      runId: EntityId;
      attemptedSnapshotId: EntityId;
      diagnostic: 'OWNER_UNSETTLED' | 'DATABASE_UNAVAILABLE' | 'CLEANUP_UNCERTAIN';
    };
```

NOT_COMMITTED requires actual original-writer settlement or genuine proof the
specific writer cannot execute again, then a complete absence check. An in-flight
same-key request returns query/in-progress, never a second writer. No PID, boolean,
empty read, timeout wrapper or newly reopened connection is such a proof.
Same-process proof must come from the actual identity-checked owner; after restart
old handles are invalid. Without a real external termination proof, a new process
can prove complete committed rows or retain UNKNOWN, not guess interruption.
Corrupt rows are a safe error, not absence. Inspector never writes state.

A known acknowledged COMMIT remains COMMITTED even if later output/serialization
or cleanup fails. Commit fact and resource cleanup are independent. The final
write orchestration's typed known-commit-plus-UNKNOWN-cleanup error/result encoding
must also be frozen under D6 before implementation; do not mislabel that case
NOT_COMMITTED or blindly repeat the write. Inspection's own uncertain cleanup
exposes no successful read result.

## Reader compatibility implementation order (still PROPOSED)

The current admission matrix is concrete: DocumentStore constructor/read/write
admit workspace7/8 and FK=ON; Contract prepare/apply admit6/7/8 through frozenSet;
combined compilation selection admits6/7/8 and FK=ON. The independent existing
Contract admission fix checks original6/7/8 and FK=ON in prepare/apply/trace and
non-null activation inspection transactions. It does not admit9/10/11. Constructor
creation alone is not a successful read or schema capability. Fresh inspection
uses its own readonly FK-enabled connection, not the caller connection pragma.

Future reader admission must use explicit version sets after exact DDL approval.
Version9 needs W009 parent/unique keys and guards;10 additionally needs all six
W010 tables plus documents(id,workspace_id) UNIQUE;11 needs the real approved
Evaluation/provenance producer and guards. Preserve W001-W008 tables, old document
head/history and runtime format1/2 validation at every committed upgrade prefix.
Do not support only11 while a successful009/failed010 leaves version9 unreadable.

Current runtimeSql performs bounded specified-column reads; FK=ON is not a full
schema or historical-integrity certificate. Required future table_xinfo/FK/index/
trigger checks must be frozen from approved DDL, accounted in existing budgets,
and exercised with missing/wrong objects and old-head/WAL/failed-prefix cases.
Table presence, a working SELECT or an unbudgeted full-database scan is insufficient.
No9/10/11 reader capability is implemented by this proposal.

## Attempt ownership and backup execution boundary (still PROPOSED)

A private attempt owner must bind the real Store, connection incarnation, run,
normalized request and attemptedSnapshotId before writing. Real acknowledged
COMMIT proves committed; successful rollback plus join of all writer work can
prove not committed. An old WeakMap receipt is not serializable authority; a new
Store's default NOT_COMMITTED is not evidence about a pre-restart attempt.
Recommend initially supporting same-process settlement only. After restart,
complete verified persistent rows may prove COMMITTED; without a real trusted
manager's matching process-instance/all-writer exit evidence, absence stays
UNKNOWN. No timeout, PID reuse, available lock or caller Boolean closes that gap.

Local Node24.15.0 exports node:sqlite backup. Its local type documentation defines
backup(DatabaseSync,path,{source?,target?,rate?,progress?}):Promise<number>, no
AbortSignal. Existing destinations are overwritten; concurrent other-connection
changes can restart copying. These are API facts, not executed backup evidence.
Use SQLite backup, not independent copying of a live main/WAL/SHM file set.

The minimum future orchestration must explicitly approve:

1. A real maintenance owner that prevents new application writers and joins all
   existing ones, binding logical database kind/owner and actual source/connection
   identity. Cooperative process gating is not protection against arbitrary
   same-account database writers. Missing exclusion or path-stability proof rejects.
2. An exclusive owned destination directory with a new non-overlapping destination,
   no link/replacement or existing-user-file overwrite. Backup's overwrite support
   is not authorization to overwrite. Fixed identities must survive asynchronous
   work; path strings alone do not prove file identity.
3. An actual backup baseline and DDL handoff. A separate guard connection may hold
   BEGIN IMMEDIATE while a different readonly source connection backs up, but that
   guard cannot retain its SQLite write lock while the current runner acquires its
   own write transaction. Releasing/reacquiring is not an atomic lock transfer.
   The genuine maintenance gate must cover the whole gap and batch, or a separately
   approved runner-owned design must remove it. Do not describe the current hook
   as providing this guarantee.
4. Real backup Promise settlement before any DDL. A deadline requests stop of later
   work; it cannot cancel this API or make its Promise settled. Uncertain completion
   preserves isolated partial output and UNKNOWN; no migration or second backup.
5. Reopen validation of integrity_check, foreign_key_check, logical owner, exact
   schema/version and committed WAL-resident sentinel data in owned tests; verify
   the sealed backup is independently usable without omitted sidecars. A final
   backup-file digest identifies that sealed result, not the live source's main-file
   digest or an automatically restorable state.
6. Explicit baseline choice: one pre-batch baseline plus exact per-step receipts
   is the smaller proposed plan; per-migration backups cost more and create more
   settlement boundaries. Either needs approval. If009 commits and010 fails, keep
   actual9 and stop; restoring the pre-batch8 backup is a separate approved action,
   never an automatic downgrade that discards new history.
7. Cleanup only registered owned artifacts after actual settlement. Uncertain
   rollback/close/backup/cleanup stops subsequent writes. Restoring a backup needs
   a new maintenance window, target checks and authorization; never edit
   user_version/checksums or overwrite a live user database to simulate rollback.

Current beforeAcquire is synchronous and before BEGIN; it is not a backup owner,
async join primitive or lock-transfer API. Any pending backupRequired=true still
rejects the whole batch. No external file/receipt/Boolean bypass is introduced.
Real backup orchestration, maintenance trust/fencing, restart evidence and user-DB
installation remain decisions. Separate owned tests exercise a tiny SQLite WAL
backup and the candidate9/10 text; they do not implement those production contracts.


## Owned experiments and duplicate-key correction - 2026-11-07

The compatibility harness runs exact W009/W010 blocks against real W008 in fresh
owned SQLite only. It compares every original table row and sqlite_schema object,
including two real DocumentStore head/history revisions; tests additive prefixes,
per-step rollback, deferred same-item pointer FK, full run/snapshot/set tuples and
one-shot run binding. Existing production readers still reject9/10. A later four-
case owned disk extension retains two nonempty Runtime activations and their parent
chain, normalized children and old document head/history across successful9/10 and
failed9-to8/failed10-to9 prefixes, followed by close and readonly reopen. It uses
existing declaration fixtures through genuine Store/matcher/derive, not real Source
or Native qualification. No user-DB upgrade is certified; W011 is never executed
or replaced by a fake Evaluation parent.

An actual counterexample showed UPDATE/DELETE guards alone permit INSERT OR
REPLACE with recursive_triggers=OFF. The candidate now adds BEFORE INSERT duplicate
checks for every declared primary/UNIQUE conflict, including alternate support,
request, publication and impact tuples. The desired rejection test first failed.
This avoids relying on connection recursive_triggers and preserves existing rows
before SQLite conflict replacement. It also rejects duplicate INSERT OR IGNORE or
UPSERT attempts: a future idempotent writer must validate/reuse an existing row
in the same BEGIN IMMEDIATE before plain INSERT, never rely on conflict SQL to replace or silently ignore it.
RAISE(ABORT) only aborts the statement: an owned experiment confirms earlier
transaction work remains until explicit owner rollback. A duplicate error alone
cannot prove reused:true. That writer and this exact candidate remain unapproved; no old migration changes.
These guards do not defend against arbitrary schema/trigger/PRAGMA manipulation
by an untrusted SQLite writer, authenticate JSON, or supply publication authority.

The independent backup experiment uses tiny owned SQLite with committed data proven
present only in WAL, a separate guard and readonly source, and real awaited backup.
It verifies standalone destination reopen/integrity/FKs/sentinel and confirms the
runner still refuses locks and backupRequired. It proves neither maintenance gate,
atomic lock handoff, cancellation, automatic restore nor production compatibility.
