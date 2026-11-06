Update: the user subsequently approved the four conservative P1-13 rules. The
[accepted bounded implementation contract](2026-11-06-p1-13-conservative-identity.md)
controls that implemented slice. This combined proposal remains history for wider
choices and R9 execution; those are not approved by the identity decision.

# Phase 1 identity contract and matching qualification proposal

Status: PROPOSED. No contract approval, implementation, qualification run or numeric adoption is implied.
Observed source: 9b473df64abc172332b9b76dacb7823315c1d08e, continuation branch.

## Verified checkpoint

[CI #128](https://github.com/tim-zxy/CodeAtlas/actions/runs/42221401179) is terminal:
TypeScript and Rust passed; Windows Native failed the mandatory script-catalog prerequisite.
The preserved result has 189 approved scripts versus 192 current: three new HOST files,
one changed `native-refresh-ci-pack.mjs`, no removed scripts, `nativeQualified:false`.
HOST26, Storage161, offline17/lifetime49 and OS-helper2 passed. Native build, Java and
heavy resource/actual22 stages were skipped, not passed. CI #127 belongs to old d64fb85.
Phase 1 remains 4/21, A6 NOT_QUALIFIED and E02 PROPOSED/uninstalled.
No matching development/test/collector process was found at this read-only checkpoint.
Git work/index content diffs were empty; status-only EOL entries were left untouched.

## P1-13: authority versus decisions

Existing authorities are ADR-007, RECONCILIATION, knowledge-and-consumption design section6,
and the P1-13 five-step task. They require opaque stable IDs, unique exact structural
matching after type/scope/state filtering, separate semantic/presentation fingerprints,
conservative merge, split review and no invented numeric thresholds or deprecation timers.
The pure decision/plan work need not depend on A6, E02, Native, models or database writes.

The current IR cannot directly supply the complete comparison input:
`KnowledgeCandidate` has structured content/support but no stateIntent or fingerprints;
`KnowledgeItem` has identity/state but no content; `KnowledgeRevision` has content and
fingerprints. Claim has CURRENT/TARGET/HISTORICAL/TRANSITION/DESIRED, but knowledge records
have no defined binding to those Claim states. A valid hash string is not derivation proof.

The following choices affect retained identity and require governed contract approval,
not an implementation guess. No Canonical IR or accepted ADR is changed by this proposal.

| Decision | Recommended direction | Unresolved detail / acceptance risk |
| --- | --- | --- |
| Comparison inputs | Private validated Candidate + Item/Revision + reference contexts; enforce item/revision/type/scope binding; preserve Canonical schemas | Define state-to-subject mapping; missing/mixed/unrelated state requires review, never defaults to CURRENT |
| Exact anchors | Versioned type-specific projection, complete scoped references, uniqueness and deterministic set/topology comparison | The field projection below and cross-revision rules decide identity and need approval |
| Fingerprints | One deterministic versioned producer/comparison policy bound to exact input and policy bytes | Producer, field projection and normalization are not specified; do not trust caller hashes or invent semantic hashing |
| Decision/plan | Preserve original signatures and decision fields; NEW requests opaque ID allocation downstream; UPDATE retains item ID | Final strict plan/reason/bounds shapes, critical-risk and claim/time/merge facts still need a concrete approved contract |

Proposed anchor field candidates, all unapproved:

| Type | Candidate identity anchors |
| --- | --- |
| COMPONENT | implementationRefs, entryPointRefs |
| CAPABILITY | componentRefs, entryPointRefs, runtimeFlowRefs |
| INTEGRATION | participantRefs, contractMatchRefs, boundaryRefs |
| BUSINESS_FLOW | participants, runtimeFlowRefs, complete directed stepKey/nextStepKeys topology |
| RUNTIME_FLOW_REFERENCE | runtimeFlowRef; separately validate basisRef provenance |

Responsibility/supported claims and support identities cannot silently be excluded merely
because the table omits them: the accepted specification explicitly lists support as an
identity signal. Their identity-versus-grounding role must be settled per type. Preserve
scope/kind/entity tuples and all topology edges; no fuzzy name/path match, best subset,
implicit revision stripping or cross-revision rename mapping. Different revisions alone
need not allocate a new knowledge ID, but an approved correspondence policy is required.

Recommended next approval is detailed contract completion within this private exact-only
boundary, followed by review of the concrete fingerprint/anchor policy before algorithm
implementation. Approving this direction alone cannot close P1-13 or authorize arbitrary
fingerprint semantics. Alternative: keep unavailable comparison cases REVIEW_REQUIRED and
deliver preparation only; this is explicitly incomplete against original rename/update gates.

After contract closure, one implementation batch should include independent literal
rename/reword/update/new/scope/state/ambiguity/merge/split/disappearance/transition fixtures,
real missing-API RED, strict pure implementation, Knowledge build and relevant IR/control/
architecture checks, registration of `p1-knowledge-identity-v1`, and fresh status/trace.
Critical/unknown/conflicting evidence requires review; advanced drift stays DEFERRED or
NOT_APPLICABLE. No publication/SQL/model call is added. Rollback disables the new private
adapter/exports without rewriting IDs, revisions, evidence or published data.

## Identity choices for a single decision

All choices below remain PROPOSED. None changes existing IDs or approves publication.

| Area | Options and outward meaning | Recommendation, compatibility and rollback |
| --- | --- | --- |
| Input/state | A: private validated Candidate + Item/Revision/context and explicitly grounded Claim-state binding. B: add fields to Canonical knowledge schemas. C: accept bare objects with guessed CURRENT | Prefer A after exact mapping approval. A can preserve existing envelope consumers; B requires schema/version/fixture migration, beyond this scope; C conflicts with state-aware reconciliation. Disable the private adapter to roll back A. |
| Anchors | A: approve explicit type-specific full-reference/topology projection. B: compare all structured fields/revision IDs. C: fuzzy name/prose or reference overlap | Prefer A, retaining support as an explicitly resolved signal. B can cause review/identity churn across wording/revisions and must not label changed prose as automatically NEW; C conflicts with unique exact-only behavior absent approved thresholds. Version the private policy; disable new decisions rather than rewrite IDs on rollback. |
| Fingerprints | A: define and implement one deterministic input-bound semantic/presentation policy. B: only consume already verified comparable fingerprints; otherwise review. C: trust caller digest strings | Prefer A for full original P1-13 acceptance; B is a safe incomplete stage and cannot pass rename/update gates alone. C is not acceptable provenance. A must settle every field/normalization and compatibility with stored revision fingerprints first; cross-policy evidence requires review. Roll back the policy adapter, retaining all old revisions and evidence. |
| Plans/IDs | A: decisions/plans only, NEW requests downstream opaque allocation; UPDATE retains item ID. B: identity helper writes revisions/publishes. C: derive knowledge IDs from names/content | Prefer A and preserve the two original API signatures. B violates Application/manual publication ownership; C conflicts with ADR007 stability. Exact action/reason/bounds shapes remain to be approved. Disabling exports is sufficient while nothing has been published. |
| Risk/merge/time | A: verified subject-bound facts and prescribed survivor priority; missing/tied facts review. B: infer criticality, overlap, winner or deprecation defaults | Prefer A. B creates new meaning/thresholds and may conflict with conservative merge, state/time and delayed deprecation. No numeric default or automatic split. Roll back only private planning; never undo user data through reset/deletion. |

Existing Candidate/Item/Revision types can already be passed through without inventing
identity semantics. A redundant wrapper alone is not a new accepted capability. A useful
comparison DTO/plan needs the unresolved fields above; do not install those choices by
calling them an internal implementation detail. No identity-equivalence or inheritance
rule was implemented while this decision remains pending.

## Concrete conservative policy candidate (not approved)

Proposed policy identity: `knowledge-exact-reference-v1`. This is a NEW private policy
proposal, not a pre-existing ADR007 interpretation. Approval must cover its rules, not
only a direction. Broader cross-revision correspondence is an alternative, not a fallback.

State binding input is an explicit list of existing Claim envelopes, exact claim refs and
the subject's CompilationInputSnapshot ref. Parse each Claim using its own reference
context; require the same complete KnowledgeScope, exact snapshot membership and a Claim
subject equal to one of the subject's approved structural refs. Claims named directly by
responsibilityClaims/supportedClaimRefs must also be members of this set. All selected
claims must have one common stateIntent from the existing five-value enum. Missing,
mixed, foreign or unproved membership yields REVIEW_REQUIRED. A caller boolean/digest
cannot prove membership; trusted capture remains P1-12/Application's responsibility.
Example: scope repo:A, implementation X and grounded CURRENT Claim about X may compare
with another validated CURRENT subject; TARGET about X is a different state partition.
An unrelated CURRENT Claim about Y cannot supply the missing state. This selection rule
itself needs approval because knowledge records currently have no such explicit binding.

Conservative anchor proposal: compare complete `(scope, repositoryId/workspaceId,
entity.kind, entity.id, entity.revisionId)` tuples with no missing-field equivalence.
Use the five rows above, AND COMPONENT responsibilityClaims/relationship kind+target,
CAPABILITY supportedClaimRefs, and all types' top-level/nested support-identity sets.
Support identity includes complete basis and entity, while valueDigest is separately
checked as grounding. Arrays of references are validated duplicate-free sets; BusinessFlow
stepKey->nextStepKeys compares a sorted directed graph, retaining every edge. Do not sort
steps into temporal claims. Runtime reference basisRef remains an exact provenance anchor.
Example: COMPONENT implementation X + entry E with unchanged exact support tuples and a
new title retains the same itemId; changing X to Y requires review. Same X ID under a
new revision is REVIEW_REQUIRED, never automatic NEW, retained identity or silent revision
stripping. This is deliberately conservative: it can require manual cross-revision review
and cannot be described as full cross-revision identity automation. More permissive stable
entity/factKey correspondence requires a separately specified evidence-backed policy.

Fingerprint proposal, to settle P3 explicitly: use one versioned package-private producer
on validated input. Presentation projection is title/summary where present. Semantic
projection is every other structuredContent field, plus scope/type/state and exact support
identity+valueDigest sets; BusinessFlow goal/actions and all limitations remain semantic.
Canonical bytes are UTF8 JSON with ordinal object-key order, explicit original scalar values,
no Unicode/newline/case coercion; only declared reference sets/topology adjacency sets sort.
Hash semantic/presentation with distinct policy-version domain prefixes and SHA256; do not
hash candidate ID, prompt/model or collection insertion order. Recompute candidate values;
compare an existing revision only if its derivation policy and exact input binding are
independently known, not merely because the IR contains two well-formed digests. Unknown
old fingerprint policy => review, no implicit migration. Example: title/summary rewrite
with equal anchors/semantic projection => UNCHANGED; changed BusinessFlow goal with equal
anchors => UPDATE (subject to review/quality gates). Grounding changes may propose a new
revision, never a new ID merely because support bytes changed. This new policy changes no
stored revision in place; rollback disables it and preserves all existing records.

Concrete planning semantics: a strict action has candidateId, existingItemIds, operation,
retainedItemId|null, previousRevisionId|null, revisionIntent NONE/NEW_ITEM/UPDATE_REVISION,
supersededItemIds, supportHealthIntent|null, reasons and requiresReview. Reject duplicate,
foreign, contradictory or unbound decisions. UNCHANGED has revisionIntent NONE; presentation
reprojection is a separate request. UPDATE retains one matched ID and requests a new revision.
NEW requests opaque allocation downstream, with no fabricated ID. Multiple exact matches or
nonexact alternatives require review; MERGE only proposes the original priority-ordered
survivor with complete verified facts, SPLIT always requires review. Disappearance proposes
AFFECTED/STALE, never automatic DEPRECATE without an approved sustained-support policy.
CONFLICT needs explicit same-state mutually exclusive Claim values and proven overlapping
time; lacking time semantics produces review. No action itself executes writes/publication.
Required finite bounds and cancellation remain mandatory: keep the first API's original
control argument; the single ReconciliationInput must carry an explicit approved control
binding before a bounded implementation, with no invented default or signature overload.
No numeric threshold/score/margin is introduced; all remain null in this policy.

## R8 mismatch: minimum matching-material update

The original immutable R8 manifest includes the generator dependency catalog in its corpus
digest. Raw observations bind that corpus; independent holdout binds the resulting candidate.
Consequently replacing a catalog, repacking old results, excluding HOST additions or applying
CI127 to new sources cannot qualify the new closure under current gates.

Read-only comparison found unchanged Runtime implementation/environment identity, all54
Native source entries, and READ_SEAL/FULL_TRANSPORT/REFRESH_VERIFY corpus identities.
Eight external package memberships and checked nonbinary bytes match. Executable binaries
were not freshly rehashed in this analysis: freeze/verify them before any authorized run.

For the current delta only, the minimum candidate plan is:

1. Finish all catalogued implementation/helper/layout changes and freeze exact checkout,
   build, tool and input identities once. Do not collect during mutable development.
2. Prepare one fresh fixed R9 root (R8 remains immutable); retain existing ownership,
   EEXIST, confinement, case selection, budgets and failure semantics.
3. Run Transport only: 22 qualification + 110 calibration (22 x5) +22 independent holdout
   =154 invocations. Reuse unchanged READ/FULL/VERIFY approvals only after exact identity checks.
4. Review the new candidate; obtain exact numeric/profile adoption approval before installing.
   Then separately authorize PACK/publication/CI reference switch and run original final gates.

The154 cases target an owned, fixed local qualification fixture/replay root, synthetic
Source/SQL/database copies and test workers on this Windows machine. They do not target
production services or a user's production repository/database. They nevertheless execute
real local Node/Native/tools, consume host resources and create diagnostic/evidence files;
this is controlled real execution, not a memory substitute, hence separate run approval.
Preparing exact inputs/executable identity and confinement is a precondition, not proved by
this high-level proposal. No credential or external production access is part of the scope.

This is a proposed real-run scope, not permission to run it. No R9 directory, implementation,
154-run batch, new profile or package was produced by this analysis. A future change to IR,
Storage, Providers or Runtime built JS may change the implementation digest and widen the
qualification scope; 154 is not a permanent guarantee for subsequent development.

Retain the original 1000000000-byte caller budget, formulas, cases/timeouts and refusal rules;
there is no hard OS memory isolation. Historical comparable Transport duration was about
2h37m, a reference rather than a promised cap. Preserve failure/exit/cleanup evidence; stop
subsequent phases on failure, without manual retries or selecting only successful samples.
Old R8 resource numbers are not automatically applicable to the new corpus. Keep all old
approvals/evidence/assets; do not restore old results as a claimed pass for new sources.

## Execution order and rollback

First close the identity comparison contract and other approved code in one integrated batch;
then freeze the dependency closure and decide the smallest still-valid qualification scope.
Offline fixtures/review may overlap independent qualification preparation, but actual resource
sampling remains serial and isolated from local builds. No unapproved core change or real run.
The current cheap fail-closed CI preserves source synchronization without granting qualification.
Preserving current R8 and leaving new Native blocked is the conservative alternative.

## Reproducible evidence

- `docs/superpowers/reviews/2026-11-06-ci-script-preflight.json`
- Local `.superpowers/sdd/2026-11-06-ci-script-preflight/final-source-sync-result.json`
- CI128 artifact13502939731: `script-catalog/result.json` (189/192, three added/one changed).
- `packages/ir/src/knowledge-ir.ts`, `document-ir.ts`, `phase1-support.ts`.
- `packages/runtime/test/helpers/native-refresh-transport-replay.mjs` corpus hash construction.
- `docs/handoff/adr/ADR-007-stable-knowledge-identity.md`, `specs/RECONCILIATION.md`.
- `docs/superpowers/plans/2026-10-22-phase1-knowledge-and-delivery.md`, P1-13 steps1..5.

## Transport execution preparation: hold before freeze/run

Proposed owned layout: `C:/CodeAtlas-P05-D5-R9`, with pinned Native under native/,
private TEMP/TMP under temp/, and immutable corpus/raw records under evidence/.
Proposed separate executor receipt/holdout root: `.superpowers/sdd/2026-11-06-r9-transport/`
in the active D worktree; holdout output must be outside frozen evidence membership.
Both roots must be absent, canonical and independently acquired; old R8 is never reused.

The existing command shape is `node scripts/native-refresh-ci.mjs prepare <receipt-root>`.
It builds Native once, prepares synthetic corpus, runs22 qualification/110 calibration,
then candidate feasibility and22 independent holdout. **Do not run the current command:**
it still selects layout-v8/R8. R9 layout/preparer/validator support and exact executable
hashes have not been implemented/frozen by this proposal. Current source is still changing;
there is no honest final corpus digest to approve yet. Freeze those ordinary preparation
changes and all catalogued build inputs first, then publish exact command+source/tool hashes.

Static execution facts: cases run serially; Native is invoked with `--parse-workers 1` and
existing10000ms client timeout, replay subprocesses have existing60000ms timeout. These are
per-operation controls, not a hard batch walltime, OS-process count or memory isolation.
The preparer may spawn rustc/cargo/compiler/linker processes before measured runs; replay
uses Node workers and real Native children. An exact maximum concurrent OS-process count
has not yet been established.154 is a case-count ceiling, NOT a process ceiling. Do not
invent a process limit or claim preparation ready until the whole spawn chain is audited.

Stop before running on occupied/aliased roots, source/tool drift, any identity mismatch,
concurrent resource workload, missing control binding or incomplete output confinement.
After a phase failure, preserve its evidence and do not start the next phase. Existing
qualification/calibration loops can record remaining phase slots after a failure; a strict
first-case-failure abort would require a separately reviewed runner change, not a promised
behavior of today's command. Never manually retry failed slots or select successful rows.
On exit require the executor receipt, exact154 coverage if successful, worker/native cleanup
and no pending handles/temporary state; unknown cleanup blocks subsequent work/approval.

The later precise authorization must cover the frozen R9 preparer/build, exact binary/input
identities, the154 serial synthetic cases, validated spawn scope/limits, directories and
normal evidence-preserving cleanup. It does not cover profile adoption, PACK, public upload,
CI-reference switch, production access or permission changes. Until prerequisites above
are complete, this is an explicit readiness gap, not an executable approval request.

## R9 explicit preparation continuation (offline implemented)

The earlier missing-R9-preparer note above is historical for that checkpoint. New explicit
`prepare <receipt-root> p05-d5-exact-layout-v9` selects R9 throughout fixture-context and
acquisition. Two-argument prepare/default layout and PACK remain v8. V1..8 roots are retained;
R9 becomes an additional frozen-output forbidden zone, not a waiver or an approved profile.
The existing finite historical preparation scope recognizes only the additional exact R9
executable path; no Source bound, budget/formula or qualification flag changes.

[Exact slice hashes and validation](../reviews/2026-11-06-r9-offline-support.json) freeze the
preparation implementation only.63 unchanged layout/pack checks passed; the affected CLI
suite passes23/23 after correcting its new test's noncanonical trailing slash. Initial
85/86 and the setup failure are retained. The positive prepare test stops at an intercepted
BUILD in a test-only child; no real R9 root, build or sample exists. Architecture17/format/
diff pass. Whole corpus/executable freeze and independent final review remain separate.

Static measured launch shape is coordinator Node -> one replay Node -> one Native OR Node
fault child, with serial cases and parse-workers1. It is NOT an enforced OS-process cap.
Cargo build and its compiler/linker/build-script descendants have no audited global process
ceiling; Windows console behavior is not proved by this analysis. Full-process maximum is
UNKNOWN, not154,1or3. Per-client10000ms/per-replay60000ms controls are not a batch deadline.
Real-run authorization must either explicitly accept that unbounded scope/risk or approve
a separately reviewed enforceable bound. No new Job/permissions/process-limit contract is
implemented by this slice. R9 PACK remains a later separate preparation and approval step.

Final independent R9 slice review found no blocker. Its positive test stops at the first
intercepted `rustc --version` descriptor call in BUILD; it does not reach cargo or actual
fixed-root acquisition. R9 PACK remains unavailable; the old R8 geometry still refuses it.

Counting clarification:154 counts measured qualification/calibration/holdout cases only.
`bench` first calls prepareRefreshTransportCorpus, which prepares Source/seed/oracles and
functional replay references using real tools. Those preparatory invocations are additional;
the maximum total real Native invocations is not yet audited. Do not request approval on
the assertion that the entire prepare command launches at most154 Native processes/cases.

Explicit PACK continuation now implemented offline: the fifth argument may be exactly
p05-d5-exact-layout-v9; candidate, holdout and original read-only layout must all select
R9. Default four-argument PACK remains R8. Original installed-profile/holdout/ownership/
ZIP verification remains intact. Two missing-argument REDs became40/40 layout+CLI green,
with48 unchanged ZIP tests reused and independent review finding no blocker. The positive
test stops at intercepted lstat; no actual layout, PACK, ZIP or numeric approval follows.
