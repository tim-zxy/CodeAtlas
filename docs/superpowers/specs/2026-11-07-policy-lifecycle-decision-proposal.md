# Private policy owner and W009-W011 persistence: decision proposal

Status: **PARTIAL BOUNDARY APPROVAL; REMAINING CONTRACTS PROPOSED**.
The user accepted option A's local same-Windows-account trust boundary on2026-11-07,
including same-SID Agents, not human consent. Current-process/specified-operation
scope and restart invalidation are required; no remote/model/scan clearance,
production publication, persistent access/security change or user-DB migration is
approved. This does not accept all proposed fields, W009-W011 or backup/Evaluation.
Issuer integration is a subsequent batch, not implemented by this record. No permission issuer,
principal, production migration, scan clearance, model invocation or publication is created.
Isolated owned SQLite candidate/backup experiments are not production implementation.
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
Restart closes all sessions. D1 must choose a real trust model, not merely name a
launcher: A explicitly trusts the local OS calling subject (including same-SID
Agents); B requires an actually authenticated external Host channel; C introduces
an OS-isolated broker and therefore a separate architecture/deployment decision.
No such adapter is currently implemented. If local Agents must be excluded from
operator authority, A is insufficient; TTY, username or a prompt does not fix it.
A is the minimum standalone option only if its wider trust boundary is explicitly
accepted. Otherwise keep issuer UNAVAILABLE pending a real B or separately approved C.

N: owner fields are private; opaque handles are identity-checked objects, never
serialized proof. String IDs are correlation only.

| Field | Exact proposed meaning/source |
| --- | --- |
| issuerHandle, issuerIncarnation | Real bootstrap Host owner and this process instance; D1 must define its origin. |
| principalHandle, principalId, sessionId | Authenticated subject and authorization session under the selected model; never caller labels. |
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

N: order is principal authentication + applicable deployment grant(A) or Host approval(B) -> request and allowed metadata resolution
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
## Technical review refinement: D1-D3 and D5-D7

All candidate schemas/choices in this section remain N/PROPOSED, except the
explicitly identified existing migration keys and run-state vocabulary. No code
in this proposal is a grant, executable migration or recovery credential.

### D1-D3: concrete channels and restart boundary

| Choice | Actual trust model and implementation impact | Required decision / limitation |
| --- | --- | --- |
| A: local OS invoker trusted | A real OS-token/SID adapter identifies the calling subject; an explicitly approved deployment rule grants only the command/dataset ceiling. ONE_SHOT only initially; no automatic MCP service extension. | Same-SID Agents are trusted too. This is not human consent and cannot isolate canonical files/DBs from a malicious same-SID process. TTY, stdin, --yes, process name or username cannot distinguish the human. The OS adapter and deployment rule do not exist yet. |
| B: external authenticated Host | Name and verify a real Host API/channel that authenticates the subject and approves this process incarnation/session/challenge/operation/scope/policy. Application and Runtime share the same enforcement. | No real API has been identified or integrated. Ordinary desktop UI alone is not proof if an Agent controls it; no caller receipt/Host-name string can mint approval. |
| C: OS-isolated broker | A distinct OS subject protects policy and approval state; authenticated/ACL-protected IPC binds both endpoints, requests, challenges and upgrades/recovery. | New process, deployment and security boundary require separate architecture approval. Another same-SID process or SID-only named pipe does not isolate that Agent. |

D1 must choose the trust boundary and exact usable channel. Recommend A only when
same-SID Agent trust is acceptable; if it is not, B needs a real API or C needs a
separate design. Do not simulate these preconditions through new callback factories.
No remote authentication or persistent credentials are implicitly introduced.

Stable subject key is {issuerNamespace,subjectId}, obtained from the actual OS
identity in A or authenticated Host in B. It supports audit/idempotency, not access.
Each process start creates a new issuerIncarnation; principal/session/operation
handles must be newly issued and never serialized/restored. Reusing the same stable
subject or policy version after restart cannot revive an old grant. Generations
are monotonic within one incarnation; resetting them on restart requires rejecting
old incarnations first and rereading actual current policy/revocation. Reconnect
must not replay old approvals; B must bind challenge, consumption-once, validity,
revocation and disconnect semantics to the actual channel.

Refine the private records above to these closed shapes (handles remain opaque):

```text
Principal = {issuerHandle,issuerIncarnation,principalHandle,principalId,sessionId}
PolicyState = {policyOwnerHandle,securityPolicyRef,domainPolicyRef,
               policyGeneration,revocationGeneration}
CapabilitySession = {principal,operationId,operation,phase,callerCapabilities,
 grantedOperations,workspaceId,repositoryIds,revisionSetId,admittedSelection,
 destination,sourceForm,resourceConstraints,policy,signal,deadlineEpochMs,state}
```

phase is the existing PRIMARY/REPAIR/FALLBACK literal bound by the trusted command
owner, never a caller switch that bypasses fallback restrictions.

principalId/sessionId are nonempty correlation strings. workspace/repository IDs,
selection and operations use existing schemas; repositoryIds is an explicit unique
set. callerCapabilities is the trusted adapter's ceiling; grantedOperations is
the current authentic grant under the chosen model. Both feed existing independent authorizeOperation checks.
No null repository set creates implicit all-repository permission. Generations are
monotonic safe integers read from the actual owner, never caller values; no initial
number, TTL or budget default is specified. Config can restrict grants, not create
them. D2 recommends QUERY plus READ_SOURCE for Source checks, plus UPDATE_KNOWLEDGE
when used for update; no implied INDEX/model/remote/scan grant. D3 must identify the
real policy/revocation owner and update channel; same-version revocation invalidates.
Restart, logout, workspace detach or session close invalidates the opaque handles.

### D5: exact candidate FK/parent mapping and installation choices

Existing keys: W004 already supplies revision_sets(workspace_id,id); W007 supplies
repositories(repository_id,workspace_id). documents has id PK but no exact
(id,workspace_id) UNIQUE; its locator expression index is not an FK parent.
These are verified from current SQL, not assumed proposed parents.

```text
snapshots(workspace_id) -> workspace(id)
snapshots(workspace_id,revision_set_id) -> revision_sets(workspace_id,id)
snapshot_supports(workspace_id,snapshot_id,revision_set_id)
 -> compilation_input_snapshots(workspace_id,id,revision_set_id)
compilation_runs(workspace_id,revision_set_id) -> revision_sets(workspace_id,id)
compilation_runs(workspace_id,snapshot_id,revision_set_id)
 -> compilation_input_snapshots(workspace_id,id,revision_set_id)
publication_runs(workspace_id,run_id,snapshot_id,revision_set_id)
 -> compilation_runs(workspace_id,id,snapshot_id,revision_set_id)
source_changes(repository_id,workspace_id) -> repositories(repository_id,workspace_id)
source_changes(document_id,workspace_id) -> documents(id,workspace_id)
impacts(workspace_id,source_change_id) -> source_changes(workspace_id,id)
impacts(workspace_id,knowledge_revision_id) -> knowledge_revisions(workspace_id,id)
```

`snapshots` abbreviates compilation_input_snapshots only in this mapping. W010
would add documents(id,workspace_id) UNIQUE plus the new tables' exact parent keys
already listed above. W009 must first define knowledge_revisions(workspace_id,id).
FKs alone do not prove frozen=1: insertion and each admitted writer must check the
actual frozen RevisionSet. Use NO ACTION/RESTRICT, not cascading history deletion.

source_changes CHECK candidates: REPOSITORY requires repository_id/non-null and
document_id/null; DOCUMENT the reverse; WORKSPACE both null. Each non-null before/
after basis must be a valid JSON object, with at least one present and the same
logical owner. These conditions do not authorize a source-change writer.

W009 candidate keys must also include knowledge_items(workspace_id,id),
knowledge_revisions(workspace_id,item_id,id), and revision's complete provenance
key (workspace_id,id,compilation_run_id,input_snapshot_id,evaluation_id,revision_set_id).
The published pointer candidate is items(workspace_id,id,published_revision_id)
-> revisions(workspace_id,item_id,id), deferred until transaction end.

W011 provenance is proposed as (workspace_id,revision_id,run_id,snapshot_id,
evaluation_id,revision_set_id), PK(workspace_id,revision_id). Composite FKs bind
its revision's entire provenance tuple, actual run/snapshot/revision-set tuple and
actual evaluation(workspace_id,id,run_id,snapshot_id). The evaluation parent key
remains undefined; W009 complete DDL is an unapproved physical candidate only. W009/W010 triggers must not refer to
nonexistent W011 tables; add publication guards in W011. Missing full W011 still
refuses publication rather than omitting provenance validation.

D5 choices: A publishes the fully reviewed 009/010/011 manifest together and runs
sequentially; B first publishes complete009/010, later only appends the already
reviewed011. Recommend B for bounded snapshot-only capability, provided all forward
contracts are frozen first. Neither permits incomplete mutable W010 or publication
before W011/policy/Evaluation. No numbering change is necessary for A or B.

### D6: precise state, inspection and sole-writer constraints

Existing design vocabulary is CREATED/CAPTURING/GENERATING/VALIDATING/READY/
PUBLISHED/FAILED/CANCELLED/INTERRUPTED. Proposed transition guards:

```text
CREATED(snapshot=null) -> CAPTURING(snapshot=null)
CAPTURING(null) -> CAPTURING(bound once)
CAPTURING(bound) -> GENERATING -> VALIDATING -> READY -> PUBLISHED
any nonterminal -> FAILED | CANCELLED | INTERRUPTED
```

All nine states may be represented in DDL without enabling unimplemented paths.
First writer permits creation/capture and actual failure endings only. Generating
and later require non-null snapshot; terminal states require finished_at_ms>=
created_at_ms; nonterminal states require null finish time. Snapshot never clears
or changes, including on failure. INTERRUPTED needs real ended/settled-owner proof;
inspect does not change run state or resume the old writer.

Keep the write receipt above; inspection has a different closed union:

```text
{status:'COMMITTED',workspaceId,runId,snapshotId,revisionSetId,inputDigest}
{status:'NOT_COMMITTED',workspaceId,runId,attemptedSnapshotId}
{status:'COMMIT_OUTCOME_UNKNOWN',workspaceId,runId,attemptedSnapshotId,
 diagnostic:'OWNER_UNSETTLED'|'DATABASE_UNAVAILABLE'|'CLEANUP_UNCERTAIN'}
```

Inspection has no reused field: persisted rows do not prove whether the original
put call reused an existing record. Corruption is a safe typed error, not absence.
COMMITTED requires complete run/request/snapshot/support validation and says
nothing about publication. A later FAILED/CANCELLED run does not uncommit a snapshot.

**Absence is insufficient for NOT_COMMITTED.** A writer with no visible row may
still be in flight or commit later. Require actual settle/join of the original
writer, or genuine proof its connection/process ended and cannot execute again,
before combining complete absence with NOT_COMMITTED. Otherwise return UNKNOWN,
without retry, generating another snapshot, changing state or calling a model.
The exact owner/settlement proof remains a D6 decision, never a caller Boolean.
A timeout/abort wrapper ending is not proof that its callback settled. An unrelated
child process exit is not proof that the original writer ended. CI149 exposed this
class of lifecycle uncertainty; D6 must require the actual matching owner proof.

Idempotency remains UNIQUE(workspace_id,caller_subject_id,request_key). Same request
with null snapshot returns query/in-progress only; it cannot obtain a second writer.
Different normalized request or actual digest conflicts. Reuse of a committed
record still requires new authorization and full validation. The actual subject (including its trusted issuer namespace and restart-stable
identity, not a display label), sole-writer proof and closed request/metadata/error
encodings must be frozen; different issuers must not collide in the subject key.

### D7: backup and rollback options

The actual runner checks pending.some(backupRequired) BEFORE any migration; any
true rejects the entire pending batch before W009. It does not first upgrade to
the version preceding that entry. There is no manual-backup-receipt bypass.

- All false: require explicit per-migration approval after exact additive DDL and
  owned upgrade/failure/reopen evidence. Old exemptions do not apply.
- Any true: retain current refusal until separately designed/approved actual backup
  orchestration exists; do not bypass runner admission.
- No installation: keep current schema/read-only capture pending these decisions.

Each migration still has its own BEGIN IMMEDIATE. A failed migration rolls back
itself, not earlier committed versions. Snapshot put failure rolls back snapshot,
supports and run binding together; uncertain cleanup stays UNKNOWN. Rollback is
closing the new writer and preserving history, not user_version downgrade or SQL
checksum edits; restoring a verified backup remains an independently approved act.

### Expanded physical candidate and unresolved producer boundaries

[Expanded W009/W010 SQL review text and conditional W011 provenance](2026-11-07-w009-w011-ddl-review-candidate.md)
remains PROPOSED and is not registered migration SQL or installation-ready. W009/
W010 now have isolated owned compatibility/constraint experiments; W011 remains
conditional and unexecuted. No user database or production reader admission changed.
W009 relation rows propose only ComponentContent.relationships ordinal projection;
other relation semantics are not invented. W011 cannot borrow the fixture/oracle
Evaluation report as production publication qualification or assume its inputDigest
equals the snapshot digest. Production persisted-report schema/validation ownership
and actual quality admission remain decisions.

D5 must also approve named workspace9/10/11 reader compatibility: current
DocumentStore7/8 and ContractStore6/7/8 reject those new versions. No >= admission
or repo-schema10 widening is proposed. Migration/reader changes must be coordinated
before any user database upgrade; publication stays closed pending full W011.
