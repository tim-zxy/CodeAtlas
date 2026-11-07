# Compilation capture private schema v1

Status: LOCKED PRIVATE V1; OFFLINE IMPLEMENTATION AND OWNED SQLITE/SUBSTITUTE VERIFICATION RECORDED BELOW. The four directions
in [the capture proposal](2026-11-06-compilation-capture-contract-proposal.md) were
approved for this bounded specification work. This file fixes private DTO shape,
allowlists and validation order; it does not install a public IR, migration,
permission, scan clearance, resource value, production route or publication gate.
Older PROPOSED wording in the proposal remains historical. This document alone
does not close P1-12, P1-14, any predecessor, or Phase1 acceptance.

Authority: P1-12/14 in [knowledge delivery](../plans/2026-10-22-phase1-knowledge-and-delivery.md),
[knowledge design sections 5/7](2026-10-22-phase1-knowledge-and-consumption-design.md),
[compatibility proposal](2026-10-22-phase1-compatibility-proposal.md), ADR-002/003/004/005/006/011/020,
Canonical IR, Knowledge Workflow, Security and SQLite specifications. Existing IR
schemas in `packages/ir/src` are the field/type authority identified below; a
future addition to those schemas is NOT automatically added to this v1 allowlist.

Assumptions and verifiable success: capture binds exactly the admitted scope and
RevisionSet; every required fact/support has an owned typed value; one transaction
per database supplies its view; all Source/bases and policy are checked again
after materialization; selection and all semantic inputs affect inputDigest;
denied, missing, unsupported, incomplete or unsettled work exposes no snapshot.
Cross-database views have a capture window, never a common-instant guarantee.

## 1. Strict request and result

All objects below are strict: every listed property is required unless explicitly
marked optional by the referenced IR schema. Reject unknown properties instead of
stripping them. `[]` is an explicit empty collection; null is permitted only where
written. All data must meet section 6 before reading or hashing; never evaluate
getters, stringify arbitrary objects, or accept a caller-owned validated label.
ID, digest, scope, basis, ref, coverage and instant names mean the existing
EntityIdSchema, Phase1DigestSchema, KnowledgeScopeSchema, RepoBasisSchema,
WorkspaceBasisSchema, DocumentBasisSchema, ScopedRefSchema, SupportRefSchema,
Phase1CoverageSchema and UtcInstantSchema, without widening their domains.

```text
CaptureRequest = {
  schemaVersion: 1,
  workspaceId: EntityId,
  scope: KnowledgeScope,
  revisionSetId: EntityId,
  repositoryIds: EntityId[],
  selectedEntityRefs: ScopedRef[],
  selectedDocumentRevisions: DocumentSelection[],
  policyVersions: PolicyVersions
}
DocumentSelection = {documentId: DocumentId, documentRevisionId: DocumentRevisionId}
PolicyVersions = {securityPolicyRef: Phase1ExactString, domainPolicyRef: Phase1ExactString}
Selection = {repositoryIds: EntityId[], selectedEntityRefs: ScopedRef[],
             selectedDocumentRevisions: DocumentSelection[]}

CompilationInputSnapshot = {
  schemaVersion: 1, snapshotId: EntityId,
  workspaceId: EntityId, scope: KnowledgeScope, revisionSetId: EntityId,
  selection: Selection,
  workspaceCapture: WorkspaceCapture | null,
  repositories: RepositoryCapture[], documents: DocumentCapture[],
  policyVersions: PolicyVersions, inputDigest: Phase1Digest,
  captureWindow: {startedAt: UtcInstant, completedAt: UtcInstant},
  coverage: Phase1Coverage
}
RepositoryCapture = {
  repoBasis: RepoBasis,
  runtimeActivationDigest: Phase1Digest | null,
  entities: CapturedEntity[], supports: CapturedSupport[], coverage: Phase1Coverage
}
WorkspaceCapture = {
  workspaceBasis: WorkspaceBasis,
  entities: CapturedEntity[], supports: CapturedSupport[], coverage: Phase1Coverage
}
DocumentCapture = {
  documentBasis: DocumentBasis, parserVersion: Phase1ExactString,
  policyVersion: Phase1ExactString,
  entities: CapturedEntity[], supports: CapturedSupport[], coverage: Phase1Coverage
}
CapturedEntity = {ref: ScopedRef, valueSchemaRef: ValueSchemaRef, value: MatchingValue}
CapturedSupport = {ref: SupportRef, valueSchemaRef: SupportValueSchemaRef,
                   value: MatchingValue, capturedValueDigest: Phase1Digest}
```

`selection` is the normalized admitted request selection, stored independently of
the transitive closure; do not replace it with whatever the adapter happened to
read. It is persisted under P1-14 and included in the digest. `snapshotId` is a new
Application-allocated opaque ID. `inputSnapshotRef` is exactly
`{kind:'COMPILATION_INPUT_SNAPSHOT',id:snapshotId}` with revisionId omitted;
revisionSetId is bound by resolving the actual immutable record. No caller ID,
path, digest, reference, Boolean, or DTO proves that record exists or is authorized.

WorkspaceBasis includes its existing workspaceActivationDigest. There is no
second, independently supplied workspace digest property. WorkspaceCapture is
mandatory for any selected/transitive workspace Runtime/Contract fact or support.
Document entities live in DocumentCapture, with document revisions as their ref
revision IDs; their workspace scope alone does not require a Runtime activation.
Workspace membership and RevisionSet are read even when workspaceCapture is null.
Repositories contain exactly selection.repositoryIds, including a selected repo
with no selected fact. Documents contain exactly admitted selected revisions and
explicitly required document dependencies; dependencies never enlarge selection.

Integrator binding fixed after review of existing runtime-fact-store/runtime-sql:
`runtimeActivationDigest` is the existing `runtime_activations.value_digest`, exposed
ONLY after the original activation reader has fully verified its payload, activation
ID, column/identity correspondence, candidate/policy digests, format1/format2,
derivation/site-plan and all fact/support membership checks. Its unchanged recipe
is `runtime-storage-value-v1` over the full stored activation payload; no new hash
recipe is introduced. A scalar row/digest read alone is never sufficient proof.
`candidate_digest` keeps its existing independent semantic validation and cannot
substitute for this activation integrity digest. Existing selected workspace
RepositoryRuntimeBinding.runtimeCandidateDigest remains unchanged. No duplicate
candidate digest field is added to the snapshot merely for reporting.
Null is legal only when no Runtime activation is required. Until a combined reader
actually exposes this fully verified value, required Runtime capture refuses.
WorkspaceBasis.workspaceActivationDigest retains its existing recipe.

The function returns this success DTO only. Refusal uses the existing typed error
channel and safe fixed diagnostics; there is no success/partial-result wrapper,
no raw row/error/source body in diagnostics and no serializable authority flag.
startedAt <= completedAt; a clock anomaly refuses rather than inventing a time.
Coverage preserves the existing limitations and unverified refs. Incomplete required
capture refuses; truthful PARTIAL analysis coverage can be represented but is never
promoted to COMPLETE or treated as permission to publish semantic knowledge.

## 2. Closed entity discriminants and field allowlists

`valueSchemaRef` is ONE literal string from this section, not a URL to fetch or an
open registry. For `X@v` below, `X` is the literal before `@`, `v` is part of that
same literal; `value` is the schema payload, except Syntax which includes its
explicit existing `{schema,version,payload}` envelope to bind the version. Entity
ref kinds are in the second column. Every nested object is limited to the exact
named existing schema and its existing discriminated alternatives. All fields
listed below are retained with their existing required/nullable/optional rules;
there is no catch-all metadata, spread of a SQL row, raw source or provider AST.

Abbreviations (exact field sets):

- N = id,factKey,repositoryId,revisionId,name,qualifiedName,sourceRange,confidence,kind.
- R = id,factKey,repositoryId,revisionId,basis,sourceRange,supportRefs,confidence,resolution.
- D = id,documentRevisionId,sectionId,ordinal,sourceRange.
- L = id,documentRevisionId,blockRef,sourceRange.

| Literal | ref.entity.kind | Existing schema and exact allowed fields |
| --- | --- | --- |
| `SourceFile@1` | SOURCE_FILE | SourceFileSchema: id,repositoryId,revisionId,path,contentFingerprint,classification,languageHint,sensitivity; classification={role,provenance,contentKind} |
| `CanonicalNode@1` | CODE_NODE | CanonicalNodeSchema: N; TYPE additionally typeKind; SYMBOL additionally symbolKind; REPOSITORY/MODULE/PACKAGE have no additional fields |
| `CanonicalEdge@1` | CODE_EDGE | CanonicalEdgeSchema: id,factKey,repositoryId,revisionId,kind,source,target,sourceRange,confidence |
| `Evidence@1` | EVIDENCE | EvidenceSchema: id,repositoryId,revisionId,providerSnapshotId,providerFact,status |
| `SyntaxEvidence@1`, `SyntaxEvidence@2`, `SyntaxEvidence@3`, `SyntaxEvidence@4` | SYNTAX_EVIDENCE | exact syntax envelope and payload whitelist below |
| `EntryPoint@1` | ENTRY_POINT | EntryPointSchema: R + triggerKind,ownerRef,contextKind,contractRef,taskRef |
| `TaskDefinition@1` | TASK_DEFINITION | TaskDefinitionSchema: R + taskKind,implementationRef,triggerRef |
| `DataResource@1` | DATA_RESOURCE | DataResourceSchema: R + resourceKind,logicalName,namespace,schemaRef |
| `DataChangeTrigger@1` | DATA_CHANGE_TRIGGER | DataChangeTriggerSchema: R + resourceRef,operation,handlerRef |
| `Contract@1` | CONTRACT | ContractSchema: R + direction,protocol,serviceRef,signature,implementationRef |
| `ExecutionContext@1` | EXECUTION_CONTEXT | ExecutionContextSchema: R + kind,entryRef,parentContextRef |
| `ExecutionNode@1` | EXECUTION_NODE | ExecutionNodeSchema: R + contextRef,kind,targetRef |
| `ExecutionEdge@1` | EXECUTION_EDGE | ExecutionEdgeSchema: R + contextRef,sourceRef,target,transitionKind,guard,boundaryRef |
| `RuntimeFlow@1` | RUNTIME_FLOW | RuntimeFlowSchema: R + entryRef,derivationVersion,contexts,steps,branches,boundaries,coverage |
| `FrameworkBinding@1` | FRAMEWORK_BINDING | FrameworkBindingSchema: R + ownerRef,kind; MESSAGE_PUBLISH/MESSAGE_CONSUME/HTTP_CALL add contractRef; DATA_READ/DATA_WRITE add resourceRef; DATA_WATCH adds resourceRef,handlerRef; TASK_CREATE/TASK_EXECUTE add taskRef; DEPENDENCY adds dependencyRef |
| `Service@1` | SERVICE | ServiceSchema: id,factKey,logicalServiceKey,location,repositoryRef,supportRefs |
| `ServiceIdentity@1` | SERVICE_IDENTITY | ServiceIdentitySchema: id,factKey,serviceRef,sourceBasis,identityKind,namespace,key,supportRefs |
| `ContractMatch@1` | CONTRACT_MATCH | ContractMatchSchema: id,factKey,workspaceBasis,consumerRef,status,candidateProviderRefs,selectedProviderRef,reasons,supportRefs,basisRefs,confidence |
| `WorkspaceExecutionNode@1` | WORKSPACE_EXECUTION_NODE | WorkspaceExecutionNodeSchema: id,factKey,repositoryRuntimeRef |
| `WorkspaceExecutionEdge@1` | WORKSPACE_EXECUTION_EDGE | WorkspaceExecutionEdgeSchema: id,factKey,sourceRef,targetRef,matchRef,transitionKind,supportRefs,confidence |
| `Document@1` | DOCUMENT | DocumentSchema: id,workspaceId,repositoryId,logicalPath,mediaType,sourceKind,currentRevisionId |
| `DocumentRevision@1` | DOCUMENT_REVISION | DocumentRevisionSchema: id,documentId,sourceFingerprint,parserVersion,policyVersion,sourceBasis,blockRefs,diagnostics,completeness |
| `DocumentSection@1` | DOCUMENT_SECTION | DocumentSectionSchema: id,documentRevisionId,parentSectionId,headingLevel,title,ordinal,sourceRange |
| `DocumentBlock@1` | DOCUMENT_BLOCK | DocumentBlockSchema: D + kind,payload; HEADING={text,level}; PARAGRAPH/QUOTE/OTHER={text}; LIST={ordered,items:[{text,blockRefs}]}; CODE={language,text,contentDigest}; TABLE={headers,rows} |
| `DocumentTable@1` | DOCUMENT_TABLE | DocumentTableSchema: L + typedContent={headers,rows} |
| `DocumentLink@1` | DOCUMENT_LINK | DocumentLinkSchema: L + typedContent={label,target,resolution,targetRef,candidates} |
| `DocumentCodeSnippet@1` | DOCUMENT_CODE_SNIPPET | DocumentCodeSnippetSchema: L + typedContent={language,textDigest} |
| `DocumentEntityMention@1` | DOCUMENT_ENTITY_MENTION | DocumentEntityMentionSchema: id,documentRevisionId,blockRef,textRange,resolution,candidateRefs |
| `DocumentChunk@1` | DOCUMENT_CHUNK | DocumentChunkSchema: id,documentRevisionId,blockRefs,contentDigest,ordinal |

Syntax whitelist: base is id,syntaxKey,repositoryId,revisionId,sourceFingerprint,
sourceRange,owner,supportRefs,confidence,extractionVersion,syntaxKind,payload.
v2 adds lexicalScope; v3 adds controlContext; v4 adds callbackScope. Payloads:

| syntaxKind | Payload fields and versions |
| --- | --- |
| DECORATION | callee,arguments (1..4) |
| INVOCATION | callee,receiver,arguments (1..4); invocationForm,calleeRange,codeCallRef additionally in 4 |
| DECLARATION | declaredType,parameterNames,modifiers (1..4); declarationForm,declaredName additionally in 2..4 (TYPE form only 3..4) |
| ASSIGNMENT | targetName,value (1..4); assignmentForm,valueRange additionally in 2..4 |
| ARTIFACT | mediaType,logicalPath,contentDigest,declaredValues:[{name,value}] (1..4) |
| IMPORT_BINDING | language,importKind,qualifiedName,importedName,boundName (3..4) |
| BINDING_EFFECT | name,effect,targetScopeRef (3..4) |
| BINDING_SCOPE | status,limitations,scopeRef,parentScopeRef (3..4) |
| PARAMETER_BINDING | callableRef,language,name,ordinal,parameterForm,declaredType,typeRange,defaultValueRange (4) |
| VALUE_LINK | relation,producer,consumer,argumentIndex (4) |
| CALLBACK_BINDING | consumer,argumentIndex,callbackForm,parentScopeRef,parameterNames,body,reference,status,limitations (4) |

Syntax nested values are exactly SyntaxValueSchema: STRING/NUMBER/BOOLEAN={kind,value},
NULL={kind}, REFERENCE={kind,name,resolution,candidates}, ARRAY={kind,items},
OBJECT={kind,entries:[{name,value}]}, UNKNOWN={kind,reason}. Arguments are
{name,value,sourceRange}; callee is {state,name,target,candidates}, adding resolution
only in v3/v4 DECORATION/INVOCATION. Sites are {syntaxKind:'INVOCATION',sourceRange};
callback reference is {qualifier:'THIS',memberName}. Use the matching existing
parseSyntaxEvidence/V2/V3/V4, plus binding/surface collection closure; never upcast
an old payload or discard newer fields to make it fit.

Other nested whitelists are the exact existing SourceRange, DocumentRange,
Confidence, CanonicalNodeRef, CanonicalTarget and ProviderFactRef schemas;
Contract signatures are Http/Message/RpcContractSignatureSchema; Runtime target,
step and branch are RuntimeTargetSchema, RuntimeFlowStepSchema and the strict
RuntimeFlowSchema branch shape. Document diagnostics are {code,sourceRange}.
No JsonValue-typed user content is introduced by this union. Existing validators'
cross-record checks remain mandatory in addition to each strict payload parser.

## 3. Closed supports and operational admission

SupportValueSchemaRef is exactly the section 2 literals EXCEPT `Evidence@1`,
`Document@1` and `DocumentRevision@1`. Its matching value and entity kind are the
same table row. The exclusions avoid inventing a support-value meaning for an
Evidence link or document root/revision. A future adapter for an excluded kind
needs an explicit contract revision; EntityRefSchema's open kind string does not
make it supported. Claim, KnowledgeCandidate/Revision, raw Provider facts/snapshots,
raw source bytes, declared-schema source contentUtf8, RuntimeDerivation/site-plan
containers and arbitrary plugin objects are outside both unions. A required one
refuses the entire capture; there is no `unknown` fallback or implicit extraction.

DTO recognition proves syntax only. Actual admission additionally requires the
owned read path, current membership, all referenced values, existing producer
digest recipe, policy/Source checks and settled resource ownership. In particular:

- SourceFile/CODE_NODE/CODE_EDGE supports retain the existing
  SHA256('codeatlas-phase1-support-value-v1' + NUL + canonicalRuntimeJson(value))
  producer recipe; verify from authenticated current/historical storage membership.
- SYNTAX_EVIDENCE support uses its existing runtime-syntax-support-v1 + NUL +
  canonicalRuntimeJson(exact versioned envelope) recipe. Historical origin/draft/
  projection identities are not interchangeable with that support.
- For other typed supports, invoke the exact existing owner recipe and membership
  validator for the originating activation. Do not guess a recipe from field name
  or kind. If the current reader cannot supply that typed original value and
  reproducible recipe, this v1 Application adapter is UNAVAILABLE and capture
  requiring it refuses. This explicitly includes document and workspace supports
  until their producer mappings are demonstrated; the table grants no new recipe.
- Evidence DTO has no support adapter. Reading an Evidence value requires the
  existing active fact/Evidence/provider-binding/snapshot relational validation
  in the owned repo view. If the new reader cannot prove this chain, refuse that
  requested Evidence or Code closure; do not fabricate a generic EVIDENCE token,
  infer provenance from providerSnapshotId, or copy provider-private data.
- Runtime V2 activation validation includes the existing derivation/site-plan and
  coverage checks internally. Since these containers are not standalone captured
  entities, they cannot be requested or used as substitutes for the typed facts.
  A consumer requiring their materialization waits for a separately reviewed adapter.
- All free text/literals, including names, paths, headings, tables, signatures,
  guard strings and Syntax STRING/declared values, pass existing actual policy
  before materialization. Metadata classification or sensitivity is not clearance.
  Required text without implemented scan/redaction clearance refuses. In particular
  deny-only document secret preflight cannot authorize body capture/storage;
  Document body adapters remain refused. Do not remove denied fields from a value
  while claiming it still matches the existing full schema or original digest.

This deliberately permits pure offline DTO fixtures to exercise values that a real
Application cannot currently authorize. A test double is marked as such outside
the snapshot and cannot supply actual permission/scan/Source/production evidence.

## 4. Ref, basis, membership and closure

1. Own and deep-copy the strict request before any await/callback. Resolve the
   caller's real operation capability and effective policies outside the DTO.
   Match both policy refs to those actual effective versions; strings are selectors.
2. Authoritatively resolve workspace ownership, registered repository membership
   and immutable RevisionSet. REPOSITORY selects exactly that repository;
   CROSS_REPO repositoryIds equals scope.repositoryIds as a set and has at least
   two; WORKSPACE uses precisely the authoritative selected RevisionSet members.
   Each selected repository must be a registered member and have exactly one
   pinned RevisionSet entry. Do not compare a repository sub-scope to every
   unselected member of a larger workspace. Reject foreign/missing/duplicate IDs.
3. Every repository ScopedRef uses the selected repo ID and pinned revisionId.
   Workspace Runtime/Contract refs use workspaceId and revisionSetId. Document
   refs use workspaceId and their exact selected/required documentRevisionId;
   resolve them via the owning Document record, never path or ID prefix. No
   captured/ref selection may omit revisionId. A document root's ref has document
   ID and chosen revision ID; DocumentRevision ref has revision ID in both slots.
   Document.currentRevisionId may be null for immutable history as returned by
   existing validated history reading; it must never be rewritten to a newer head.
4. RepoBasis equality is all four fields, not repo/revision alone. DocumentBasis
   equals document/revision/sourceFingerprint; parserVersion/policyVersion equal
   that immutable DocumentRevision. Repo sourceBasis resolves to the exact captured
   RepoBasis. WorkspaceBasis equality includes workspaceActivationDigest and the
   same workspaceId/revisionSetId. Document sourceBasis and repository ownership
   retain existing DocumentBundle checks. A historical basis that cannot be
   authenticated through existing controlled Source remains unavailable.
5. For each entity, table kind, valueSchemaRef, value.id and ref.entity.id agree;
   repositoryId/revisionId and source/range/document IDs agree with its owner.
   Entity uniqueness is scopedRefKey; also reject conflicting kind/id in one
   owner/revision and existing factKey/syntaxKey/ordinal uniqueness violations.
6. Each SupportRef must pass its existing basis/entity revision equality rule.
   Match its entire basis to the owned capture and entity to the exact typed
   value. DocumentBasis support belongs to its DocumentCapture; WorkspaceBasis
   support belongs to WorkspaceCapture; RepoBasis support to RepositoryCapture.
   Reject duplicate supportKey and conflicting valueDigest or schema/value for
   the same (basisKey,entityRefKey), even when full supportKey differs.
7. Start with exact selected entities/revisions and follow required typed refs,
   ranges, supports and existing validator collection obligations to a fixed point.
   Include document section parents/linked blocks, Syntax binding scopes/sites,
   Code resolved/ambiguous targets, Runtime contexts/steps/edges and Contract
   matches/services as required. Non-resolved hints remain hints; candidate refs
   still resolve as inventory members. Never invent external payloads. A closure
   edge outside admitted repositories/revisions/doc ownership refuses, rather than
   silently broadening scope. Shared dependencies are materialized once per key;
   same value may appear in entity and support wrappers but must be byte-equivalent
   under section 6 and have the same schema version.
8. Build reference contexts from captured values and authoritative owner reads,
   not caller externalRefs/supportInventory assertions. Run existing bundle/set/
   context validators against the closure. No dangling nested ref, range, basis,
   collection obligation or unsupported required kind is omitted for a budget.
   Read-only scope diagnostics never run Claim extraction, a model, or publication.

## 5. Owned reads, revalidation and present gaps

Storage must add a private composition per repository, owning exactly one
BEGIN/COMMIT (or ROLLBACK) and one explicit shared request budget/account. Internal
helpers read Source target, pinned revision, Code activation/facts/evidence/support,
Syntax membership, Runtime activation and contracts in that same view; reuse all
current R013 validators. Reject caller transactions, closed/reopened connections,
unknown schema/FKs, unbounded deliveries and nested public transaction owners.
The schema10 code-context-capture API stays unchanged and is NOT widened to 13.

The workspace composition similarly owns ONE workspace DB view for registration,
membership/RevisionSet, WorkspaceBasis/activation, workspace Runtime/Contract
values/supports and exact selected Document histories. Reuse DocumentStore's
internal row/bundle validation and budgets; readRevisionBatch alone supplies only
its own document transaction and cannot be called inside this new composition.
ContractStore.readWorkspaceInputs and readRuntimeBindingForWorkspace currently
own separate reads; concatenating their returned objects does not close this gap.
Resolve initial selection then compare it with this combined authoritative view.

After all DB reads and closure validation, Application rechecks EACH repo using
the existing controlled Source issuer/selection/identity/content hash checks;
then rechecks pinned bases, Code/Syntax/Runtime activation/support membership,
workspace registration/RevisionSet and workspaceActivationDigest, document source
bases and exact revision membership. Recheck actual permissions/policies/control
after reads. Source document bytes are only source input, never a CompilationInput
Snapshot credential. WORKTREE labels and DB historicalSourceProof=UNAVAILABLE
cannot prove content equality. No new filesystem flag, Git or Native run is granted.

On any mutation, revocation, changed policy, missing required value, budget/control
failure or UNKNOWN cleanup: settle/join owned work and refuse the whole result.
Release handles exactly once; no successful result before settlement. Only then
copy/freeze the result, complete the audit window and recompute its semantic digest.
Later consumers repeat relevant policy/basis checks; capture is not permanent access.
P1-14 alone adds append-only W010/FKs, pre-publication checks, atomic publication,
receipt recovery and post-commit COMMITTED_WITH_AFFECTED_SOURCE behavior.

## 6. Array order, canonical bytes and digests

Canonical JSON C uses JSON.stringify scalar/string escaping and finite number
encoding, recursively emits own object keys in ascending UTF-16 code-unit order,
and emits arrays in the order prescribed here. Compare strings with `<`/`>`, never
localeCompare/locale collation. Reject proxies, cycles, custom prototypes,
accessors, symbols/non-enumerable properties, sparse/extra-property arrays,
undefined/bigint/functions, NaN/infinities, negative zero and unpaired surrogates
in keys or values. Preserve Unicode exactly, with no normalization. Object-key
enumeration must not accidentally restore integer-looking keys to insertion order;
the encoder emits sorted key/value text directly. Deep shared immutable values
are allowed; cycles are not. Reject duplicate raw JSON keys at a byte-decoding
boundary, before JSON.parse can discard them; this is a private DTO contract,
not authorization to introduce a new public byte parser.

Only the following paths are sets and are copied/sorted before C:

| Paths | Ascending key; duplicates rejected |
| --- | --- |
| request.repositoryIds; selection.repositoryIds; CROSS_REPO scope.repositoryIds | exact ID string |
| request/selection.selectedEntityRefs; snapshot/capture wrapper coverage.unverifiedRefs | C(full ScopedRef) |
| request/selection.selectedDocumentRevisions | C([documentId,documentRevisionId]); additionally one revision per document in explicit selection |
| repositories | repoBasis.repositoryId |
| documents | C([documentBasis.documentId,documentBasis.documentRevisionId]) |
| each capture.entities | C(full ScopedRef); identity collision checks in section 4 also apply |
| each capture.supports | C([ref.basis,ref.entity,ref.valueDigest]); identity collision checks in section 4 also apply |
| snapshot/capture wrapper coverage.limitations | exact limitation string |

ALL OTHER arrays are sequences and remain byte-significant in stored order,
including arrays inside value, basis/ref/schema values, Syntax arguments,
parameterNames/modifiers/object entries/candidates/supportRefs, Runtime steps/
branches/contexts/outgoingStepKeys/reasons, Contract pathSegments/candidate refs/
basisRefs/supportRefs, Document blockRefs/diagnostics/list items/table headers/
rows/cells/chunks/links/candidates. This rule intentionally does not guess that
an IR field named refs is a mathematical set. Existing owner validators/digest
recipes retain their own order rules; capture never rewrites their values.
In particular RuntimeFlow.value.coverage (i.e. the coverage inside a captured
RuntimeFlow value), and every other embedded IR coverage, retains its array order;
the wrapper coverage set rules above do not recursively match field names.
Section 4 duplicate rules and existing IR uniqueness constraints still apply
to sequences; other repeated sequence elements retain multiplicity. Structural
document record lists used to construct entity inventory follow their stored
ordinal/document order before wrapping; entity inventory itself is the set above.

```text
capturedValueDigest = hexLower(SHA256(UTF8(
  'codeatlas.capture-value.v1\n' + C({valueSchemaRef,value}))))
content = {schemaVersion,workspaceId,scope,revisionSetId,selection,
           workspaceCapture,repositories,documents,policyVersions,coverage}
inputDigest = hexLower(SHA256(UTF8(
  'codeatlas.compilation-input.v1\n' + C(content))))
```

Use LF in these two domain separators, with no BOM or trailing newline. Existing
SupportRef.valueDigest is verified BEFORE this additional digest, using the
original owner recipe (including NUL separators when that recipe uses NUL).
Changing either digest field/value/schema/selection/policy/basis changes content;
changing an unordered collection's delivery order does not. Internal sequence
order changes do affect it. Never use the Knowledge field-name sorting helper.
snapshotId and captureWindow are excluded only from semantic inputDigest; the
future immutable record binds them to all full content. Equal semantic digest is
not authority, record identity or an idempotency key. P1-14 compares the exact
authorized normalized request and actual stored inputDigest; no update-in-place.

## 7. Exact offline implementation and verification order

Implementation update 2026-11-07: private DTO/closure/digests, owned repository and
workspace compositions and Application/Runtime offline capture are implemented.
[Integrated evidence](../reviews/2026-11-07-capture-markdown-integration.json)
distinguishes genuine SQLite ownership from substituted Source/policy evidence;
body scanning, unavailable support recipes, W010, publication and actual R9 remain
closed. The sequence below retains the original refinement-time plan/history.

No commands in this section were run for this documentation-only refinement.
Future implementation follows these dependencies, within separately authorized
offline scopes and the repository protocol; no new numerical formula/default.

1. Preserve the exact existing activation value_digest mapping above before
   implementing Runtime capture. Freeze independent strict DTO/digest fixtures
   for p1-compilation-snapshot-v1: all table variants, unknown fields/kinds/versions,
   ref/basis mismatches, Unicode/number/object hazards, conflicting supports,
   exact selection, digest vectors, wrapper set permutations and nested sequence
   permutations. Hand-write expected bytes/digests independently of product code.
2. Implement private pure DTO/allowlist/closure/canonical-digest validation first.
   Prove API-absence/behavior RED then GREEN with only the new contract test file;
   no IR schema/public package or generic JSON registry change. Pure validation
   tests explicitly do not prove authorization, Source, scan or actual capture.
3. Extract reusable INTERNAL repository row helpers without weakening old public
   transaction ownership. Add owned temp SQLite R013 composition tests covering
   Code/Evidence/Syntax/Runtime joins and format1/format2 validation, corruption,
   second-connection WAL writer between component reads, rollback/close failure,
   cancel/deadline/budget and untouched last-good state. Keep schema10 regression.
4. Add owned workspace composition tests with registration/RevisionSet/workspace
   activation AND selected historical documents in ONE read view. Inject second-
   connection activation/document changes between reads; verify exact revision
   refusal (no head fallback), complete rollback and unchanged existing readers.
5. Add Application capture tests in packages/application/test/compilation-input.test.mjs:
   authority before body reads; wrong/foreign selection; denied transitive text;
   scan unavailable despite a deny-only clean result; mutable Source movement;
   same WORKTREE label/different bytes; policy revocation; final workspace movement;
   Source/handle UNKNOWN cleanup; no model/write/publication call. Use real owned
   Storage views plus explicit Source/policy substitutes for the offline lane;
   mark actual Source authenticity/scan/production tests unproved when substituted.
6. Execute the affected named Node suites and relevant package builds, existing
   Fixture comparator/registry obligations and `node scripts/check-architecture.mjs`
   only under the integrator's authorized run plan. Record reproducible command,
   exit/counts and limitations once in CURRENT_STATUS/traceability. No test or
   fixture may lower a gate or call an unavailable adapter a successful empty set.
7. Only afterward undertake P1-14's existing W010 persistence/publication plan:
   append-only reopen/FKs, same idempotency key with different selection, failed/
   partial capture retaining old published head, lost acknowledgement recovery,
   pre/post-commit Source checks. Nothing in steps 1..6 authorizes publication.

Remaining implementation gaps are explicit: complete owned Storage read
composition; original typed producer mappings for currently incomplete supports;
Evidence relational capture; actual source/scan/policy clearance and later W010.
These are not solved by Boolean/digest receipts. This specification does not prove any product adapter, test, Native/R9 run, migration,
permission or publication gate. Dependency adoption has its separate exact evidence;
it is not a Source/scan/capture authorization proof.

## Acquired owner-frame cleanup clarification

Application registers the exact frame returned by each successful owner acquisition
for reverse-order cleanup before inspecting that frame. Frame shape is the existing
private owner-port shape (repository handle/capture; workspace handle/selection/
workspaceCapture/documents), with own enumerable data properties; getters/proxies
are not evaluated as capture data. After validation, a frozen snapshot binds the
same opaque handle for later cleanup. If frame validation fails, release is still
attempted against the original acquired frame. Failed release remains UNKNOWN and
does not prevent release of other acquired owners. No snapshot escapes failed or
unsettled capture; this clarifies the existing cleanup/no-getter invariant only.

A synchronous frame is registered without await/thenable assimilation. Only genuine
Promises on the declared asynchronous port are awaited. An asynchronous producer
must validate its closed, non-thenable frame before resolving and retain cleanup
responsibility on failure; Application cannot undo thenable assimilation that has
already happened inside a producer Promise. No new thenable protocol is admitted.

An acquisition that throws before returning a frame still owns its transaction
settlement. If rollback or its connection witness fails, the existing
CONTEXT_UNAVAILABLE refusal retains cleanupState UNKNOWN through Runtime/Application;
absence of a returned frame does not imply SETTLED. Other already acquired owners
are still released. No automatic retry, transaction adoption or repair is permitted
by this error; the producer's existing connection/transaction guards remain.
