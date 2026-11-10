# P1-11 private offline semantic invocation boundary

Implements knowledge-and-consumption section4 within existing Application/IR
boundaries. Four tasks only: CAPABILITY_SYNTHESIS, BUSINESS_FLOW_SYNTHESIS,
COMPONENT_SUMMARY, CLAIM_EXTRACTION. No dependency, public schema/export, HTTP
client, endpoint, real model, Source read, database or publication is introduced.
This is a TEST_DOUBLE safety component, not full SemanticContextBuilder or E08/E14.

The request keeps exactly the seven declared fields: taskKind,promptRef,
modelPolicyRef,outputSchemaRef,authorizedContext,inputDigest,invocationBudget.
Private context refinement is {instructionRef,dataLabel:'UNTRUSTED_DATA',scope,
inputSnapshotRef,data,referenceContext}; instructionRef equals promptRef. The
provided reference context is structurally validated and copied; it is NOT a
permission or actual snapshot record. inputDigest is SHA256 of canonical context
bytes, an offline integrity hint. inputSnapshotRef uses the locked kind/id-only
shape. No caller Boolean can authorize production context.

invocationBudget explicitly supplies maxInputBytes/maxOutputBytes, no defaults.
The same caller-owned account supplies checkpoint/own/reserveBuffer/visitItem/
invalidate plus reserveCall and chargeUsage({inputTokens,outputTokens}); calls,
copies/work and reported usage stay with that run owner, never a fresh per-retry
budget. Unknown usage invalidates and refuses. Failed/incomplete attempts still
consume a call and invalidate the owner; no retry/repair/expansion/fallback loop.

Only a private TEST_DOUBLE port is accepted: fixed identity
{providerId,modelId,adapterVersion}, explicit outputMode NATIVE_JSON_SCHEMA/JSON/
PROMPT_JSON, and generate(request,control):Promise<result>. Port references and
request/control are snapshotted without getters/proxies. No endpoint redirects or
real adapter path exists. A port label cannot establish real model evidence: all
successful outputs are permanently TEST_DOUBLE/NOT_EVALUABLE, publication not
attempted, context authorization NOT_ESTABLISHED.

Result keeps structuredOutput,identity,usage,finishReason,outputDigest,warnings.
STOP is the only complete finish; LENGTH/CANCELLED reject. Bound output bytes and
digest, identity and schema/task correspondence, candidate-only publication state,
scope/snapshot binding and all references using existing parseKnowledgeCandidate
or parseClaim. These are schema/allowed-reference checks only. Model confidence,
authority and semantic truth are NOT verified or admitted for publication. Raw
errors/warnings/URLs are not logged; warning presence becomes a safe generic code.

Cancellation/deadline uses the original intrinsic signal and fixed deadline. Await
the actual generation promise to settle before rejecting cancelled work; no race
that abandons a live worker. Port contract must join its own tasks. Thenables are
not awaited. Invalidation failure stays UNKNOWN. No partial result becomes output.
After generation settles, bounded usage metadata is recorded before cancellation/
deadline output refusal. chargeUsage is synchronous settlement and must not skip
accounting just because the request was cancelled. Errors report usageSettlement
NOT_ATTEMPTED/RECORDED/UNKNOWN separately from cleanupState. Missing usage remains
UNKNOWN; an asynchronous budget settlement also leaves cleanup UNKNOWN. This is
reported usage, not independent verification of provider token measurements.

Tests use self-owned context snapshots and local JS doubles: four task success,
injection-as-data, unknown task/schema/capability/provider, hallucinated references,
wrong scope/snapshot/digest, partial output, usage/call budget, errors/thenables,
and cancelled generation settlement. Actual policy/redaction/producer provenance,
transport/adapters/model quality and complete workflow remain unimplemented and
separately gated. Rollback disables this private entry; there is no persisted state.

Evidence (2026-11-07): Application build passed;18 local-double cases plus29
owned-database/schema/backup cases passed together (47/47), architecture17 passed.
Independent review identified cancelled-attempt usage loss; the strengthened test
failed before the settlement fix, then passed with deadline/unknown-usage cases.
Initial API-absence tests and W010 candidate-state test also demonstrated RED.
No real model, user body, permission, production adapter or database was involved.

## Captured-facts preparation and invocation integration

Private buildCapturedSemanticTestRequest(input,options,control,account) now joins
the P1-12 structural snapshot to this boundary. options has exactly taskKind,
promptRef,modelPolicyRef,invocationBudget; scope/snapshot/schema/data/allowlist and
context digest are derived, never separately supplied. Independently validate the
entire snapshot, including producer/capture support digests and closure, then keep
all of it under untrusted data. Derive a deduplicated sorted reference context
from captured entities, support-only entities/supports, and the exact REPOSITORY
references already permitted by snapshot repoBasis. Document support entities use
the existing WORKSPACE scope. Preserve policies, coverage, limitations and bases.
No dropping facts/supports to fit: input/request UTF8 ceilings and the same account
apply to preparation as well as generation. Copies and control are independent;
original cancellation remains effective even if caller replaces its signal.

The facts-only preparation supports COMPONENT_SUMMARY and CLAIM_EXTRACTION.
BUSINESS_FLOW_SYNTHESIS additionally requires the explicit structural inputs below;
CAPABILITY_SYNTHESIS still returns CAPABILITY_UNAVAILABLE because its validated
knowledge context has not been implemented. The original
four-task TEST_DOUBLE invocation port remains unchanged. No fake Component or
RuntimeFlow reference is invented to make higher-level synthesis appear connected.
The helper performs no Source/body I/O, permission/scan checks or model call and
is not a trusted SemanticContextBuilder. It must only receive self-owned fixtures
in this offline phase; digest validity is not permission or provenance. Existing
result flags continue to refuse quality/publication/authorization claims.

Five new tests first failed before implementation. Independent review identified
the omitted legal repository-level reference; its regression failed before the
fix and now proves exact repository Claim success and foreign repository refusal.
Application build,63 related tests (23 semantic,40 snapshot contract) and17-project
architecture check passed. No dependency, public export, installed Runtime or
acceptance gate changed. This connects self-owned snapshot -> request -> local
Claim result, not authorized capture -> real model -> validated publication.

## Joined captured invocation and inherited coverage

runCapturedSemanticTestDouble joins preparation and invocation under the same
fixed original control/account. Existing owned-stage failures propagate without
second invalidation; validation after successful generation retains RECORDED
usage, refuses incomplete/overstated results and invalidates once. It returns the
captured input digest and conservative capturedCoverage alongside the unchanged
TEST_DOUBLE/NOT_EVALUABLE/NOT_ESTABLISHED result annotations. No publisher or
production authorization is introduced.

Coverage includes the snapshot plus every repository/document/workspace capture,
not just the top-level summary: use the weakest status and union of limitations
and exact unverified references. A KnowledgeCandidate must not claim stronger
coverage or omit any of these restrictions; it can add uncertainty. Claims retain
this coverage as result metadata without adding a field to the Claim schema.
Snapshot/digest validation does not prove actual completeness or semantic truth.
Self-owned Component fixtures use actual typed CODE_NODE inputs and SourceFile
support; no fake COMPONENT identity is inserted into the capture registry.

Three new tests first failed before the joined entry existed. Independent review
found the initial top-only coverage check; a valid COMPLETE-top/PARTIAL-child case
demonstrated the missed rejection before the fix. Tests cover honest partial
output, overstated status, missing limitations, unsupported input and nested
unverified references. Application build,66 related tests (26 semantic/40 capture
contract) and architecture17 passed. No real model, user data, database or R9.

Capability synthesis remains refused: current Knowledge IR/identity fixtures
describe Component references but do not define how a pre-identity structural
candidate becomes that stable COMPONENT ScopedRef/revision. The current capture
value registry does not contain Knowledge/Component records. Reusing fixture
allowlists or candidate IDs would invent a binding. A precise draft/reference
binding or a validated reader of existing published knowledge is still required;
this batch does not choose one or change identity/publication contracts.


## Owned BusinessFlow structural inputs (2026-11-10)

Private refinement only: the existing seven request fields, Canonical IR, snapshot
schema, identity and publication contracts are unchanged. BUSINESS_FLOW_SYNTHESIS
can now prepare data.businessFlowInputs={schemaVersion:1,capturedInputDigest,flows}.
Each flow record contains runtimeFlowRef,entryRef,contractRef,serviceRef and original
bindingSupportRefs. At least one RUNTIME_FLOW must be explicitly selected; closure
members alone do not expand the selection. Sort by full scoped reference key.

Derive every record only along captured RuntimeFlow.entryRef -> EntryPoint.contractRef
-> the unique workspace contractBindings entry -> captured Service. Every hop uses
exact scope/id/revision, the original typed value and complete validated support
closure. Missing/null/ambiguous bindings or missing typed values refuse with
CAPABILITY_UNAVAILABLE; malformed snapshots/digests retain existing input errors.
Never infer service ownership from shared repository, Contract.serviceRef, names,
model suggestions or candidate IDs. The former facts-only BusinessFlow refusal is
replaced only for this explicit private structural-input path; legacy facts-only
snapshots still refuse. Capability synthesis remains unavailable.

Keep the full original snapshot/reference context and hash the complete resulting
context using the existing inputDigest algorithm. Same account, byte/work budgets,
cancellation, coverage inheritance and TEST_DOUBLE output checks apply. This is
untrusted structural association, not business intent, temporal/causal ordering,
observed execution, Source provenance or permission. No business step/action,
Component/Knowledge identity or semantic claim is synthesized by this preparation.
The local double supplies candidate semantics; schema and allowlisted-reference
checks do not independently prove those semantics or restrict all participants to
these structural paths. Results remain TEST_DOUBLE/NOT_EVALUABLE/NOT_ESTABLISHED,
publication NOT_ATTEMPTED. No real model or production consumer is introduced.

Tests use independent literal owned structure and expected scoped paths, not user
data or a claimed production Runtime activation. Rollback disables this private
BusinessFlow branch; no database, public API or persisted state changes.
