# Accepted bounded P1-13 conservative identity implementation

## Invocation-local preprocessing reuse

Routine implementation optimization within the unchanged exact-only contract:
reconciliation already validates/prepares every subject and existing item, then
repeats that work in each identity comparison. Reuse those prepared values within
the same synchronous invocation and same KnowledgeBudget; never cache across calls
or trust an externally supplied prepared object. Standalone identity still validates
all its inputs. Keep duplicate checks, current/historical/state/scope partitioning,
exact anchors, fingerprints, review outcomes, inputDigest and final control gates.
Charge actual comparisons and retained validation; no maxItems/default/threshold
change. Fewer repeated visits may allow a valid batch under its existing caller
budget, representing less work, not waived validation.

Baseline synthetic8-by8 ambiguous batch needs more than200000 maxItems solely due
to repeated preparation (200000 returns CONTROL_BUDGET;400000 returns8 review
actions). Add RED under200000, preserve the literal ambiguity/review/no-retained-ID
expectations and equality to the high-budget plan, run all five-type fixture roots,
then build/architecture checks and independent review. No publication/data/ID change.

Implemented verification: the200000 batch failed with CONTROL_BUDGET before the
change, now returns exactly the same8 review actions/inputDigest as the high-budget
plan. maxItems1 still returns no actions and CONTROL_BUDGET. Combined five-type
batch retains the original exact opaque IDs. Knowledge build,40 identity/reconcile
tests and architecture17 passed. Independent review found no high/important issue
and independently ran the17 reconciliation cases (a subset of40, not extra cases).
No public index export, schema, policy/threshold/default, fixture fingerprint,
cross-request cache, Source grant, database, publication or actual model change.
Rollback replaces the internal prepared call with the previous validated entry;
no persisted state or ID migration. Original P1-13/E09 acceptance remains open.

Status: approved conservative rule scope, implemented offline. This extends private
comparison/plan detail under ADR007 and existing exact-only rules; it changes no
Canonical schema, opaque ID format, AUTO/MANUAL rule, numeric threshold or publisher.
The wider old proposal and all R9 execution remain unapproved outside this scope.

## Inputs and trust boundary

Knowledge exports resolveKnowledgeIdentity(input,control) and reconcileKnowledge(input).
Private Candidate input combines the existing envelope, Phase1ReferenceContext and
stateBinding. Existing input combines Item + Revision envelopes/context/stateBinding
and fingerprintPolicyRef. The original strict IR parsers validate all envelope values,
supports and references. Item/type/published-head correspondence must hold. Only ACTIVE
published identities may be kept automatically; historical lifecycle entries remain
explicit review alternatives, not restored or silently reclassified as NEW.

StateBinding is null or inputSnapshotRef + Claim envelopes. Snapshot refs must agree;
Claim scope equals complete knowledge scope, subjects must be structural references,
direct responsibility/supported Claim references must be supplied and all Claim states
must agree. Use only the five existing states. Missing/foreign/mixed/unrelated state
requires review. This proves structural supplied-input consistency, NOT actual capture
or authority. Reference contexts must come from the future validated Application capture;
this package is not exposed as a publisher or an untrusted external tool endpoint.

## Conservative identity projection

Compare complete scoped entity tuples including revision; no case/name/path fuzzy
matching, revision stripping or automatic cross-revision mapping. Scope repository sets
are order-independent, not case-folded. Type projections are:

- COMPONENT: implementationRefs, entryPointRefs, responsibilityClaims, relationship kind+target.
- CAPABILITY: componentRefs, entryPointRefs, runtimeFlowRefs, supportedClaimRefs.
- INTEGRATION: participantRefs, contractMatchRefs, boundaryRefs.
- BUSINESS_FLOW: participants, runtimeFlowRefs, complete stepKey/nextStepKeys topology.
- RUNTIME_FLOW_REFERENCE: runtimeFlowRef and exact provenance basisRef.

All projections also retain the set of top-level/nested support basis+entity identities.
ValueDigest is checked through IR support closure and compared in semantic content rather
than treated as a new opaque identity. References/topology adjacency sets sort without
losing edges; no order or exclusive branch is inferred. Different structures/revisions,
unknown old policy/data, ambiguous exact alternatives or historical lifecycle => review.
No existing identity in the validated type/scope/state partition proposes NEW, with no
allocated ID. A unique comparable exact identity retains its opaque ID.

## Deterministic fingerprints and plans

knowledge-exact-reference-v1 recomputes both fingerprints from validated values.
Presentation consists of existing title/summary fields; semantic consists of every other
structuredContent field plus type/scope/state/supportRefs. Goal/action/limitations remain
semantic. Canonical UTF8 JSON uses ordinal object keys and the declared reference-set
ordering; no Unicode/newline/case coercion. SHA256 has separate versioned semantic and
presentation domain prefixes. Existing recorded digests must match recomputation under
the same known policy; a caller policy label or digest alone grants no authority.

Equal semantic content -> UNCHANGED; presentation rewrite does not allocate a semantic
revision. Same exact anchors with changed semantics -> UPDATE proposal retaining item ID,
requiring review. Scores, thresholds and ambiguity margins stay null. Manual publication,
quality, source freshness and compilation currency remain separate responsibilities.

Reconciliation shares one explicit cooperative control across its complete input. Control
fields must be own data, copied to a fixed snapshot before validation; Proxy/accessors do
not execute. The genuine AbortSignal brand supplies cancellation. maxItems charges visited
values/string characters/comparisons and maxDepth bounds nesting; no numeric default or
physical RSS claim. Final checkpoints cover hashing, sorting and freezing. Exhaustion,
cancel/deadline returns review/no partial actions. Invalid/cyclic/foreign data refuses.

Plan inputDigest binds normalized supplied values including claims/context/requests,
excluding control. It is an integrity hint, NOT a capture/authentication/publication token.
Actions retain all candidateIds and compared existingItemIds/existingRevisionRefs, including
ambiguity/unavailable/nonexact review alternatives. Singular candidateId/previousRevisionId
are present only where meaningful. NEW_ITEM/UPDATE_REVISION are downstream allocation
requests; no write, issued ID, restoration, supersession or commit receipt is manufactured.

MERGE intents without complete independently verified survivor facts remain review-only
with no chosen survivor; SPLIT always reviews. Missing time/exclusivity facts cannot assert
CONFLICT. Support disappearance only proposes AFFECTED, with no invented deprecation timer.
Complete positive merge priority/time facts and actual snapshot integration remain open
original obligations. Advanced drift stays DEFERRED, never PASS by a stub.

## Verification and rollback

Independent five-type JSON data and pre-implementation Python hashlib literal fingerprints
are registered as p1-knowledge-identity-v1. Both original test roots run in the mandatory
root test. API-absence and boundary/review REDs are preserved; no baseline is installed.
Only Knowledge's internal IR dependency and exact bootstrap export pins change.

Rollback disables the new package exports/adapter and preserves all existing IDs/data,
fixtures and evidence; no DB reset, profile change or deletion. Original P1-13/E09 and
Phase1 acceptance remain open where the complete original obligations are unproved.

## Ordinary input-integrity correction

Reference-set normalization does not apply within Claim value JSON: literal arrays
remain ordered even when a user key is named steps/participants/repositoryIds. This
corrects the private plan inputDigest binding; the five typed knowledge semantic/
presentation projections and their independent digests remain unchanged. Strict
object keys compare exact counts and strings, without delimiter-joining aliases.
No new identity equivalence, lifecycle restoration or publication authority is added.

Logical input work also charges object-key characters, and oversized arrays/key sets
refuse before bulk descriptor materialization. This uses the existing explicit
maxItems allowance, with no added default, physical resource number or identity rule.
