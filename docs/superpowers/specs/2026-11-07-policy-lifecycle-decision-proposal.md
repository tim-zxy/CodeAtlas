# Private policy owner and W009-W011 persistence: decision proposal

Status: **PROPOSED ONLY, NOT APPROVED OR IMPLEMENTED**. No permission issuer,
principal, migration, scan clearance, model invocation or publication is created.
This records the two concrete decisions blocking later production capture/storage;
it does not replace current specifications. Independent P1-10 parser/preflight
implementation continues without either decision.

F below means an existing requirement; N means a proposed refinement requiring
review. Approving field names alone cannot establish a real issuer or authorize
body reads. Unknown principal, ownership, policy or cleanup always refuses.

## A. Process-local authorization owner

### Existing authority

- F: [first-batch Operation authorization](2026-10-22-phase1-first-batch-contracts.md)
  requires both caller capability and permission-context grants, separated QUERY,
  READ_SOURCE, UPDATE_KNOWLEDGE, INDEX and model/embedding permissions. Its decision
  function explicitly does not authenticate identities.
- F: [SECURITY](../../handoff/specs/SECURITY.md) separates query/update, enforces
  raw/derived classification and secret/remote blocks, and prohibits raw-secret
  persistence. Source content proof is not permission or scan clearance.
- F: [AGENT_API](../../handoff/specs/AGENT_API.md) binds each MCP process to one
  workspace and each request to scope, capabilities, budgets and cancellation.
- Fact: current Runtime WorkspaceContext is a placeholder; config YAML and
  OperationPolicyInput provide no principal, consent, issuer or revocation owner.

### Recommended minimum and decisions

N: use one process-local Host authorization owner; Runtime holds necessary private
ports and Application constructs/enforces actual OperationPolicyInput. No public
JSON grant factory, persistent credentials, cross-process token or remote identity.
Restart closes all sessions. The first implementation must name the real bootstrap
adapter: local operator explicit consent or an existing authenticated desktop Host.
Neither adapter exists in the present code. **D1: choose and define that actual
principal/consent source before issuance; do not infer it from OS username, a
configuration file or the requesting Agent.** A local bootstrap-only first slice
is recommended over introducing remote authentication.

N: owner fields are private; opaque handles are identity-checked objects, never
serialized proof. String IDs are correlation only.

| Field | Exact proposed meaning/source |
| --- | --- |
| issuerHandle, issuerIncarnation | Real bootstrap Host owner and this process instance; D1 must define its origin. |
| principalHandle, principalId, sessionId | Host-authenticated subject and consent session; never caller labels. |
| operationId, operation | New opaque request instance and one existing PolicyOperation literal. |
| workspaceId, repositoryIds | Actual workspace registration intersected with current Host grant; no implicit wildcard. |
| revisionSetId, admittedSelection | Concrete frozen RevisionSet and exact selected refs/revisions; closure cannot enlarge scope. |
| allowedOperations | Current Host grants intersected with existing policy decisions. |
| destination, sourceForm | Existing LOCAL/REMOTE and RAW/DERIVED; no remote default or fallback. |
| securityPolicyRef, domainPolicyRef, policyGeneration | Current policy-owner versions, not copied request strings. |
| revocationGeneration | Current permission revocation state, independent of policy version equality. |
| signal, deadlineEpochMs, resourceConstraints | Owned existing explicit controls/limits; intrinsic AbortSignal checks; no new TTL/default/formula. |
| state | Private OPEN / SETTLING / CLOSED; no reopening or credential reuse. |

D2: choose the capture operation mapping. Recommendation: QUERY for authorized
facts, additional READ_SOURCE for actual Source verification; knowledge-update
use also requires UPDATE_KNOWLEDGE. Capture itself grants neither INDEX nor model
use. D3: name the authoritative policy/version/revocation store and how current
state is reread. D4: any future body clearance needs its own approved scan/redaction
issuer; this proposal preserves current deny-only behavior.

N: private ports:

```text
beginAuthorizedOperation(hostSessionHandle, command, selection, control)
assertDatasetRead(operationHandle, actualDatasetManifest)
currentPolicyVersions(operationHandle)
assertLive(operationHandle)
finishOperation(operationHandle)
```

N: order is Host authentication/consent -> request and allowed metadata resolution
-> freeze current scope/operations/generations -> authorize the full actual dataset
before each body read -> existing one-view-per-DB capture and Source checks ->
settle all owned work -> final recheck of current permissions, generations and
controls -> close and expose the result, with no await between that final check
and exposure.
A false/unknown issuer, revoked grant, changed policy, expired control, unauthorized
transitive text or UNKNOWN cleanup refuses the whole result. A scan with no known
match never supplies clearance.

No SQL migration is needed for this process-local proposal. Rollback closes the
new route and all sessions; it never falls back to accepting DTO grants. Safer
alternative: keep production issuer UNAVAILABLE and use explicit offline doubles.

## B. Lifecycle persistence

### Existing authority and minimum scope

F: [knowledge design sections 5/7](2026-10-22-phase1-knowledge-and-consumption-design.md)
assigns W010 source_changes/impacts, compilation_runs/publication_runs and immutable
compilation_input_snapshots/snapshot_supports; W011 completes same-workspace
knowledge_revision_provenance(revision_id,run_id,snapshot_id,evaluation_id).
F: [private capture v1](2026-11-06-compilation-capture-schema-v1.md) fixes snapshot
content, support closure and both unchanged hash recipes; snapshotId/window bind
the full record despite exclusion from semantic inputDigest. No update-in-place.
F: [delivery P1-12/14](../plans/2026-10-22-phase1-knowledge-and-delivery.md) assigns
persistence to P1-14, after W009; W011 and actual quality/policy gates precede publish.
Current installed migration definitions stop at W008.

N recommendation: freeze all six W010 tables together, but first implement only
createRun -> capture -> atomic putValidatedSnapshot -> authorized inspect/recovery.
Keep source_changes/impacts writers, model execution and publication closed.
Do not install a partial W010 whose published checksum would later need mutation.
Alternative requires an explicitly approved migration-number redesign first.

### Proposed exact fields

Every specific column/key/state/receipt below is **N**, not already approved DDL.
Use STRICT tables, parameterized SQL and enabled FKs. T means nonempty TEXT plus
existing EntityId/ExactString validation; D means lowercase64-hex digest; E means
nonnegative safe-integer epoch milliseconds; J means JSON object validated by one
closed named schema. No untyped JSON success labels. Nullable columns are explicit.
Historical records have no cascading deletes.

| Table | Proposed columns | Proposed keys/invariants |
| --- | --- | --- |
| compilation_input_snapshots | id T, workspace_id T, revision_set_id T, schema_version INTEGER=1, input_digest D, capture_started_at_ms E, capture_completed_at_ms E, payload_json J | PK id; UNIQUE(workspace_id,id,revision_set_id); same-workspace RevisionSet FK; end>=start; reject every UPDATE/DELETE. |
| snapshot_supports | workspace_id T, snapshot_id T, revision_set_id T, support_key T, basis_key T, entity_key T, support_value_digest D, captured_value_digest D, value_schema_ref T, payload_json J | PK(workspace_id,snapshot_id,support_key); UNIQUE(workspace_id,snapshot_id,basis_key,entity_key); composite snapshot FK; reject UPDATE/DELETE. |
| compilation_runs | id T, workspace_id T, revision_set_id T, caller_subject_id T, request_key T, request_json J, state T, snapshot_id nullable TEXT, metadata_json J, created_at_ms E, finished_at_ms nullable INTEGER | PK id; UNIQUE(workspace_id,caller_subject_id,request_key); UNIQUE(workspace_id,id,snapshot_id,revision_set_id); RevisionSet and nullable snapshot composite FKs; request identity immutable, snapshot binds once, no delete. |
| publication_runs | id T, workspace_id T, run_id T, snapshot_id T, revision_set_id T, expected_heads_json J, result_heads_json J, committed_at_ms E, receipt_json J | PK id; UNIQUE(workspace_id,run_id); composite FK to actual run/snapshot/revision set; insert only in successful publication transaction; no UPDATE/DELETE. |
| source_changes | id T, workspace_id T, basis_kind T, repository_id nullable TEXT, document_id nullable TEXT, before_basis_json nullable TEXT, after_basis_json nullable TEXT, observed_at_ms E | PK id; UNIQUE(workspace_id,id); kind REPOSITORY/DOCUMENT/WORKSPACE; at least one basis, same logical owner; composite repo/document FKs; append-only. Writer closed initially. |
| impacts | id T, workspace_id T, source_change_id T, knowledge_revision_id T, basis_key T, freshness T, reason_code T, observed_at_ms E | PK id; UNIQUE(workspace_id,source_change_id,knowledge_revision_id,basis_key); same-workspace source-change/W009 revision FKs; freshness AFFECTED/STALE; append-only observations. Writer closed initially. |

N: add required composite UNIQUE indexes to existing referenced parents in the new
migration, after validating existing data; never silently rewrite old migrations.
No cross-repository-database FK or new live fact truth store.

N: expected_heads_json/result_heads_json are closed objects {heads:[...]}; the
heads array has the unique, stable tuple ordering defined below.

N: payload_json is C(fullSnapshot), including ID/window/all typed values and
selection. Read verifies the whole DTO/closure/inputDigest plus header agreement
and exact support-row membership. Stored JSON must equal C(the fully validated
value), including support payloads, rejecting duplicate-key/noncanonical encodings.
No UNIQUE on input_digest: equal semantic input
is not identity or idempotency. support payload is exactly the existing captured
support wrapper. basis_key=C(ref.basis), entity_key=C(ref.entity); support_key uses
the existing supportKey. support_value_digest and captured_value_digest retain
their separate original meanings; no row/content hash substitute.

### Proposed order, receipt and repeat requests

N: after actual authorization and frozen selection resolution, create a run in
CREATED, snapshot null; move to CAPTURING before executing capture outside SQL.
One BEGIN IMMEDIATE in putValidatedSnapshot verifies real run/request/selection/
policy, inserts the full snapshot and supports and binds run.snapshot_id once.
Failure rolls back the whole transaction. This first slice remains CAPTURING with
snapshot bound; GENERATING/VALIDATING/READY/PUBLISHED transitions stay unavailable
until their actual contracts/records are implemented. No fabricated model metadata.

N: closed capture-only metadata v1 is:

```text
{schemaVersion:1,workflowRef,securityPolicyRef,domainPolicyRef,storageLimits,
 taskVersionRefs:[],promptVersionRefs:[],modelPolicyRef:null,modelVersionRefs:[],
 invocationRefs:[],validationRefs:[],candidateRefs:[]}
```

storageLimits are actual existing HistoryReadLimits, without defaults. Empty/null
means not executed, never model/Evaluation success. This provisional encoding and
state representation need explicit review; future nonempty provenance is not
implicitly admitted by these placeholders.

N: SnapshotReceipt alternatives:

```text
{status:'COMMITTED',workspaceId,runId,snapshotId,revisionSetId,inputDigest,reused}
{status:'COMMIT_OUTCOME_UNKNOWN',workspaceId,runId,attemptedSnapshotId,
 diagnostic:'SNAPSHOT_COMMIT_UNKNOWN'}
```

Pre-commit failure remains a safe typed error. On lost COMMIT acknowledgement,
never regenerate/retry blindly. Proposed inspectSnapshotCommit(runId,expectedRequest,
budget,syncCheck) reauthorizes and validates real run/snapshot/support rows, returning
only proven COMMITTED, proven NOT_COMMITTED or UNKNOWN; its exact discriminated
result still needs freezing. A receipt/ID/digest grants no later access.

N: request_json is closed {schemaVersion:1,captureRequest,updateMode,expectedHeads,
workflowRef,modelPolicyRef}; expectedHeads is the unique stable set of
{itemId,revisionId|null}. Idempotency scope is actual workspace/Host subject/key.
Same key with different normalized request or actual inputDigest conflicts. Exact
request+stored inputDigest may return the original immutable record only after
fresh authorization and full validation; reused=true. New history requires a new
key. Never overwrite ID/window or use digest equality alone.

### Migration, rollback and decisions

F/N: W009 establishes items/revisions/relations and proposed workspace composite
keys, retaining TEXT forward provenance refs; W010 creates the six tables and
indexes; W011 adds full provenance and binds actual revision/run/snapshot/evaluation
within one workspace. **D5: freeze W009-W011 exact DDL/FK/create order together.**
D6: approve subject/idempotency scope and receipt/recovery/state/metadata encodings.
D7: specify backupRequired for each new migration; prior exemptions do not extend.

F: current runner applies contiguous immutable-checksum migrations separately,
rolls back only the failed migration, and rejects backupRequired=true until backup
orchestration is available. Do not downgrade user_version, delete history or edit
published SQL to roll back. Disable the new writer and preserve the DB; restoration
from a separately verified approved backup is a distinct operation.

F: publication still returns SCHEMA_CAPABILITY_UNAVAILABLE until full W011,
Evaluation and actual policy gates exist. Any eventual publication is one validated
workspace transaction with provenance/receipt and head CAS; post-commit Source
changes report actual COMMITTED/AFFECTED rather than pretending rollback.

Principal/scan confusion, mistaken UNKNOWN retry, cross-workspace provenance and
fake successful model metadata are the primary risks. The safer alternative is
read-only capture with no migration or issuer, which remains the current state.