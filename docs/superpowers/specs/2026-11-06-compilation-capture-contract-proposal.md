# Compilation capture: four concrete decisions

Status: PROPOSED, NOT APPROVED OR IMPLEMENTED. This narrows the existing P1-12/14
architecture; it does not change IR, SQL, permissions or acceptance gates. No new
snapshot API, capture authority or production clearance is installed by this file.

## Existing authority and limits

- Knowledge/consumption design sections 5 and 7; compatibility proposal sections
  4/5 require immutable filtered input, source/support digests, per-database views,
  final basis revalidation, policy rechecks and W010 history.
- P1-12 owns Application capture; P1-14 owns W010 persistence and publication.
- Existing IR: RepoBasis, WorkspaceBasis, DocumentBasis, KnowledgeScope, ScopedRef,
  SupportRef (including basis/entity revision equality), Phase1Coverage, EntityRef.
- Existing KnowledgeCandidate/Revision already carry inputSnapshotRef. A reference
  or caller digest cannot prove membership or authorize reading/publishing.
- Existing code-context capture is schema10, returns basis/inventory metadata and
  historicalSourceProof=UNAVAILABLE. It is NOT a complete current R013 fact capture.
  Runtime and document reads currently own separate transactions; simply calling
  them consecutively cannot satisfy one coherent repo view.

All shapes below are recommendations for approval, not existing frozen fields.
The smallest approach is a strict private capture contract using existing IR
values. Alternatives are to defer capture entirely, or create a new public IR/wire
now. Defer blocks P1-12/14; a new public wire adds unnecessary compatibility scope.
Recommend the private contract and keep public Canonical IR unchanged.

## 1. Request, snapshot and scope binding

Proposed strict request fields:

```text
schemaVersion: 1
workspaceId: EntityId
scope: existing KnowledgeScope
revisionSetId: existing EntityId
repositoryIds: unique EntityId[]
selectedEntityRefs: unique existing ScopedRef[]
selectedDocumentRevisions: {documentId, documentRevisionId}[]
policyVersions: {securityPolicyRef, domainPolicyRef}
```

Control/permission and caller-owned budgets are trusted Application port arguments,
never serializable request flags. No request may claim authorization, freshness or
validated status. Scope selection must equal authoritative workspace membership and
RevisionSet repository selection; Document revision membership must resolve from
owned workspace storage and its Source basis. A path is only a locator. Required
selection missing/foreign/duplicate/unsupported means refusal, not silent omission.

Proposed immutable result fields:

```text
schemaVersion: 1
snapshotId: opaque EntityId, allocated by Application
workspaceId, scope, revisionSetId
selection: {repositoryIds, selectedEntityRefs, selectedDocumentRevisions}
workspaceCapture: WorkspaceCapture | null
repositories: RepositoryCapture[]
documents: DocumentCapture[]
policyVersions
inputDigest: Phase1Digest
captureWindow: {startedAt, completedAt} // existing UTC instant representation
coverage: existing Phase1Coverage
```

selection is the normalized exact admitted request selection, retained independently
from transitive dependencies. It is persisted and hashed, so selecting A cannot be
confused with selecting B merely because both have the same support closure.
WorkspaceCapture contains the existing WorkspaceBasis (including
workspaceActivationDigest), materialized workspace entities/supports and coverage.
It is mandatory for any selected or transitive workspace-level fact/support; null
is legal only when no workspace-level capture is needed. Workspace membership and
RevisionSet are still read authoritatively in every case.

RepositoryCapture contains `repoBasis`, `runtimeActivationDigest`, a typed set of
materialized facts/supports, and explicit coverage. DocumentCapture contains the
existing DocumentBasis plus parserVersion/policyVersion and selected structural
values. Immutable `inputSnapshotRef={kind:'COMPILATION_INPUT_SNAPSHOT',id:snapshotId}`
omits optional revisionId: its revisionSetId is separately bound in the snapshot.
This reference rule is a proposed core choice; existing IR must not be changed to
install it before approval. Snapshot IDs are opaque, not derived from names or paths.

Risk: scope/revision mismatches could produce false provenance. Refuse mismatches
and verify all nested refs against the owned captured membership. No WORKTREE ID
alone proves equal content. No full snapshot returned after a partial failure.

## 2. Materialized content, support closure and secret boundary

Use a closed versioned private union of existing validated values, not `unknown`,
raw SQL rows or arbitrary caller payloads:

```text
CapturedEntity = {ref: ScopedRef, valueSchemaRef, value: matching existing IR value}
CapturedSupport = {ref: SupportRef, valueSchemaRef, value: matching existing IR value,
                   capturedValueDigest: Phase1Digest}
```

Initial adapters cover selected canonical Code facts/evidence, approved Syntax /
Runtime facts and contracts/bindings, and selected structural Document revisions.
Each discriminant names one existing parser and exact source schema; not every
EntityKind is automatically supported. Required unsupported kinds refuse capture.
No inferred facts, future claims, provider-private AST, raw source/prompt, credentials
or permissive fallback. Existing already-persisted Claims may be added only through
an explicitly approved typed adapter; no implicit claim extraction in capture.

Materialize selected entities and their required transitive typed support closure.
Require exact full basis/ref/value correspondence, uniqueness and no dangling refs;
never truncate required closure to meet a budget. Only allowed derived fields may
be included, with permission checks before body materialization and after reads.
Caller booleans or strings do not prove clearance. Current deny-only document secret
scan cannot authorize captured body storage: content needing unimplemented scan /
redaction clearance must refuse, even if no known pattern matched. This remaining
clearance decision is not solved by adopting a snapshot type.

Risk: under-capture loses provenance; over-capture leaks data. Recommend explicit
adapter field allowlists and whole-capture refusal, not broad row copying. Stored
snapshots remain subject to later policy checks; capture permission is not permanent.

## 3. Canonical bytes, digests and ID/provenance binding

Recommend domain-separated SHA-256 over strict finite JSON data encoded as UTF-8:

```text
capturedValueDigest = SHA256('codeatlas.capture-value.v1\n' + canonical({valueSchemaRef,value}))
inputDigest = SHA256('codeatlas.compilation-input.v1\n' + canonical(content))
content = {schemaVersion,workspaceId,scope,revisionSetId,selection,workspaceCapture,repositories,documents,policyVersions,coverage}
```

Canonical: reject accessors/proxies/cycles, undefined, symbols, bigint, NaN/infinity,
negative zero and unpaired surrogates; sort object keys by UTF-16 code units, use JSON
string escaping, preserve Unicode without normalization. Sort only declared sets
(repository captures, selected refs, support inventory, document selections) by
complete canonical keys; reject duplicate keys. Preserve semantic array order inside
IR payloads (document blocks, parameter order, etc.). Never reuse the knowledge
comparison helper's field-name-based set sorting for arbitrary captured IR.

Existing SupportRef.valueDigest remains its original owner-defined digest and must
be checked using its existing producer recipe. capturedValueDigest is additional,
not a replacement or a silent rewrite of historical support semantics.

Exclude opaque snapshotId and captureWindow from inputDigest so equal semantic
input/policy can compare despite another capture time or allocation. The immutable
W010 record binds snapshotId to both full content and audit window; idempotency must
compare actual inputDigest and exact authorized request, not snapshot ID alone.
Different selected data/support or policy versions changes inputDigest. This new
encoding and reference binding needs explicit contract acceptance before consumers
or persisted rows rely on it. No numeric memory/resource formula is proposed.

Risk: wrong set ordering can hide semantic differences; excluding audit metadata
from semantic equality must not allow record mutation. W010 must be append-only;
no update-in-place of content or IDs. Publish consumers must resolve actual records.

## 4. Same-database read composition and mutable Source verification

Recommend a new private Storage read composition that owns BEGIN/COMMIT once for
one repo DB and passes only internal read helpers the same DB and request account.
Read Source target state, Code activation/facts, current Syntax/Runtime activation
and contract/support values in that transaction. Do not adopt caller transactions
or combine independent public reader results and call them one snapshot. Reuse
current R013 validation internally; do not relax schema10 capture to accept13.
The workspace DB composition owns its own single read transaction for authoritative
membership/RevisionSet, any selected workspace Runtime/Contract values and complete
WorkspaceBasis, and selected Document revisions. Reuse document batch row validation
inside that owned workspace transaction, not a nested call to its transaction-owning
public method; a historical revision needs the equivalent internal row helper.
Check exact requested document revision IDs. The existing batch reader alone is not
a coherent workspace Runtime/Contract/document capture.

Application ordering: authorize/own selection -> read authoritative RevisionSet ->
read each repo view serially or independently without shared connection mutation ->
read the combined workspace view -> validate complete support/scope closure -> recheck all
repo Source content/basis, workspace membership/RevisionSet and workspaceActivationDigest,
and all activation/support digests -> recheck policy ->
freeze result. On every path settle owned reads/handles. Unknown cleanup, mutation,
revocation, expired control or budget exhaustion refuses the result. A returned
snapshot grants no later model-send, write or publication permission.

WORKTREE verification must use existing controlled Source selection/hash/identity
checks, not a revision label alone. Database-only historical context with
historicalSourceProof=UNAVAILABLE must remain unavailable where actual historical
Source content proof is required. No new filesystem trust flag, no Git/Native run,
no cross-database transaction or simultaneous-state promise is introduced here.
P1-14 rechecks before publication and after commit; post-commit source movement is
COMMITTED_WITH_AFFECTED_SOURCE, not rollback. Persisted receipt can resolve uncertain
commit acknowledgement; no blind retry.

Risk: repo state can change between databases or after the last check. Report the
capture window and selected basis; later consumers revalidate. The new composition
must prove real same-DB concurrent-writer behavior, not only callback doubles.

## Approval scope, order and rollback

Requested future decision: accept all four exact private contracts above, or revise
specific fields/rules. This document itself grants no implementation approval.
Then implement strict DTO/digest validation and combined read adapters with existing
owned SQLite fixtures, wire Application capture, and only afterward implement W010
under P1-14 with the matching provenance FKs and publication gates. Real R9, parser
adoption, scan clearance, permissions and resource/profile values remain separate.

Conservative alternative: keep the verified private readers and Source recovery,
return unavailable for full capture. Rollback before publication is to disable the
new private composition and retain current readers; never delete evidence or change
historical digests/old migrations. After any W010 implementation, an additive
migration plan and retained referenced snapshots are required; no destructive reset.
