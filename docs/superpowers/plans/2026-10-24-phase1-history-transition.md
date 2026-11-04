## B1-B1 local declared-history transition checkpoint — 2026-10-24

User “批准” approved the [T1–T3 plan](2026-10-24-phase1-history-transition.md). All three are locally complete only as LOCAL_DECLARED_HISTORY_TRANSITION_CONTRACT: two private Providers modules, owned strict declarations, full Source diff, Python file-local/Java projection-group reuse, original support lifecycle, foreign revalidation refusal, declared coverage and final-basis Syntax obligations. [Implementation author review](../reviews/2026-10-24-phase1-history-transition-implementation-review.md) records contracts/REDs/corrections/remaining gaps. Earlier plan-pending entries below are historical snapshots, not current task status.

Fresh27-file cohort662PASS/0FAIL/0SKIP/0TODO (136new+526existing),Providersbuild0,architecture17;registry51/exact25Phase1/one newID/catalog0. Independent18-family46-case95-file Fixture predates product; formatting successor preserves all expected bytes and JSON meaning, original freeze/bytes retained. Receipt:.superpowers/sdd/2026-10-24-phase1-history-transition/implementation-verification.json. Original468 coveredFixture paths and old product/IR/SQL/wire/index/Runtime/Storage/locks/profiles remain unchanged; root gains exactly3 test paths, Providers incremental build cache changes as generated metadata.

Pure consistency/drafts do not authenticate history/Source/run, assemble final Canonical candidate, map Syntax to finalbasis, freeze a lease or call Store. B1-B2/C/D and B0b-3/C,P1-04/05/Phase1 remain OPEN. No DB/R4,Rust,NativeCLI/helper,measurement/calibration/profile/numeric/dependency,cloudCI,stage/commit/push/cleanup. C1EPERM OPEN,fourC2 lifetimes spent,timeoutUNKNOWN,maincancelunqueried,R4untouched. Provider-independentIR/SQLiteauthoritative/LLMcandidate-only/AUTO-MANUAL/ExecutionGraph→RuntimeFlow→BusinessFlow and Deferred boundaries preserved.

# Phase1 B1-B1 Declared History Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in this session, sequentially. Steps use checkbox (`- [ ]`) syntax. User-selected execution overrides delegation, worktree creation and commit steps; none is authorized.

**Goal:** Validate untrusted declared history/current-state/target/observation data and produce a deterministic, bounded transition draft without asserting history authenticity or publication readiness.

**Architecture:** Two private Providers modules separate owned input validation from Source/support transition policy. Reuse existing IR schemas, Evidence identity, collectMergeSupports, selectMergedFacts and bounded serialization; return decisions/references, never a final merged repository or a Storage lease. Independent fixtures precede implementation.

**Tech Stack:** Existing TypeScript, Node24, Zod, node:crypto/node:util, node:test and Fixture Manifest tooling; no dependency change.

**Spec:** [Accepted B1-B direction](../specs/2026-10-24-phase1-history-support-design.md), [B1 composition boundary](../specs/2026-10-24-phase1-b1-composition-design.md), [ADR-020](../../handoff/adr/ADR-020-phase1-contracts-and-evaluation.md).

**Status:** Written direction ACCEPTED by user “确定”; this concrete plan REVIEW_PENDING. T1..T3 NOT_STARTED. No product/tests/Fixture/registry change this planning turn.

## Global Constraints

- Continue C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas, branch codex/p05-integrated-exit-audit; HEAD cc5a8cb571986c5e56ed04053b2c96ef500fcacb. D main is an older checkout, not the implementation target.
- Preserve provider-independent Canonical IR, SQLite authoritative, LLM candidate-only, AUTO/MANUAL and ExecutionGraph → RuntimeFlow → BusinessFlow. No Deferred feature.
- Pure declarations establish consistency only. Never return authenticated/ready/applicable, connection/lease/owner token, final RepoBasis or CanonicalSyntaxEvidence.
- B1-A remains unchanged/full-projection-only. No public index export, existing caller routing, Storage/Runtime/IR change, SQL/R011 DDL, actual DB/R4, Native CLI/helper, Rust run, measurement/calibration/profile, numerical threshold or cloud operation.
- maxSerializedBytes/maxItems/maxDepth are mandatory caller-provided logical bounds; no defaults or new profile. No allocation/RSS/performance proof.
- Preserve original fixtures/evidence/failures/EOL/.superpowers. No reset/stash/stage/commit/push/cleanup/new worktree/session/subagent. Local receipts replace commit steps.
- Implementation starts only after whole-plan approval. Cloud CI/writes require separate approval.

## Review Focus

1. Same WORKTREE/fingerprint with changed R009 confidence, foreign support, membership or coverage ⇒ HISTORY_CHANGED after comparing full declared state (T1 H04).
2. Native withdrawal with valid foreign support retains it; removal/change of its Source ⇒ OTHER_PROVIDER_REVALIDATION_REQUIRED (T2 H10/H11).
3. Range-less Java containers and zero-fact Python files follow complete dependency units/coverage, not range/event counts (T2 H07/H08/H14).
4. Caller mutation/getters/proxies/unsafe Unicode/deep/oversized data cannot invoke getters or mutate owned output; bound failures are explicit (T1 H17/H18).
5. Partial/late observations, false fresh origins and old Syntax basis cannot retire outside scope, rewrite origins or reanchor Syntax (T2 H12/H15/H16).

## File map and task dependencies

| Path | Responsibility |
| --- | --- |
| `packages/providers/src/history-transition-input.ts` (new) | Packet/types, bounded owned copy, structural/relational validation, draft digest |
| `packages/providers/src/history-transition.ts` (new) | Source diff, dependency/lifecycle/reference decisions, frozen result |
| `packages/providers/test/history-transition-input.test.mjs` (new) | Input relations/ownership/budgets |
| `packages/providers/test/history-transition.test.mjs` (new) | Transition behavior |
| `packages/providers/test/fixtures/history-transition-helpers.mjs` (new) | Literal fixture loading/adversarial variants; never generates goldens |
| `scripts/test-history-transition.mjs` (new) | Independent expected-result oracle |
| `fixtures/phase1/history-transition/` (new) | Manifest and literal input/expected families |
| `package.json` (existing) | Exactly three appended root test registrations |
| Governance docs listed in plan receipt | Direction acceptance, plan/local evidence, no deleted history |

T1 (fixture/owned packet) → T2 (transition rules) → T3 (registration/scoped gates/evidence). T1 is independently reviewable; T2 needs its exact owned type; T3 needs both. No parallel shared edits. B1-B2 and C/D are separate successors.

## Exact private contracts

Existing SourceFile/ProviderSnapshot/CanonicalNode/CanonicalEdge/RepoBasis/Evidence/FactEvidence/ProviderFactBinding/ProviderFactRef/MergeObservation/MergeSupport retain their project schemas. TargetSource is existing SyntaxTargetSourceSchema. Digest is lower-case64-hex SHA-256. Identity fields use EntityIdSchema; component identity strings are nonempty scalar data. All records are strict readonly JSON, no executable modules.

```ts
export interface HistoryTransitionLimits {
  readonly maxSerializedBytes: number;
  readonly maxItems: number;
  readonly maxDepth: number;
}
export interface HistoryContractIdentity {
  readonly providerId: string;
  readonly extractor: string;
  readonly normalizer: string;
  readonly contract: string;
  readonly policy: string;
}
export interface HistoryDependencyUnit {
  readonly id: string;
  readonly providerId: string;
  readonly kind: 'PYTHON_FILE' | 'JAVA_GROUP' | 'PROVIDER_SCOPE';
  readonly sourceFileIds: readonly string[];
}
export type HistorySupport = Omit<MergeSupport, 'inputPath'> & {
  readonly dependencyUnitIds: readonly string[] | null;
  readonly valueDigest: Digest;
};
export interface HistoryCoverage {
  readonly unitId: string;
  readonly facet: string;
  readonly originSnapshotId: string;
  readonly coverage: 'COMPLETE';
}
export interface HistorySyntaxOrigin {
  readonly id: string;
  readonly unitId: string;
  readonly originSnapshotId: string;
  readonly valueDigest: Digest;
  readonly basis: RepoBasis;
}
export interface DeclaredActivationState {
  readonly basis: RepoBasis;
  readonly repositoryLocatorDigest: Digest;
  readonly inventory: readonly SourceFile[];
  readonly contracts: readonly HistoryContractIdentity[];
  readonly units: readonly HistoryDependencyUnit[];
  readonly snapshots: readonly ProviderSnapshot[];
  readonly nodes: readonly CanonicalNode[];
  readonly edges: readonly CanonicalEdge[];
  readonly supports: readonly HistorySupport[];
  readonly coverage: readonly HistoryCoverage[];
  readonly syntaxOrigins: readonly HistorySyntaxOrigin[];
}
export interface DeclaredHistoryRecord {
  readonly activationId: string;
  readonly parent: null | {
    readonly activationId: string;
    readonly repositoryId: string;
    readonly revisionId: string;
  };
  readonly state: DeclaredActivationState;
}
export interface DeclaredNativeObservation {
  readonly observation: MergeObservation;
  readonly units: readonly HistoryDependencyUnit[];
  readonly supportDependencies: readonly {
    readonly providerFact: ProviderFactRef;
    readonly unitIds: readonly string[];
  }[];
  readonly coverage: readonly HistoryCoverage[];
  readonly requestIdentity: Digest;
  readonly outputIdentity: Digest;
  readonly settlement: 'DECLARED_SUCCEEDED';
}
export interface HistoryTransitionPacket {
  readonly history: DeclaredHistoryRecord | null;
  readonly current: DeclaredActivationState | null;
  readonly expectedActivationId: string | null;
  readonly expectedOldBasis: RepoBasis | null;
  readonly target: {
    readonly source: TargetSource;
    readonly repositoryLocatorDigest: Digest;
    readonly inventory: readonly SourceFile[];
    readonly contracts: readonly HistoryContractIdentity[];
  };
  readonly observation: DeclaredNativeObservation | null;
}
```

exported PreparedHistoryTransition is exactly readonly packet: HistoryTransitionPacket, readonly limits: HistoryTransitionLimits, readonly budget: CompositionBudget. Digest is a private type alias for string constrained by the digest schema.

This is a private declared-policy packet, not the persisted ActivationHistoryRecord/R011 format. Parent is one predecessor reference: reject self/cross-repository links; complete chain/cycle authentication belongs to C. Null current means no Code; a present empty graph still has complete census/coverage. Unknown foreign dependencies use null and block reuse; empty dependencies are not Source-independent proof. Source-independent foreign support needs a separate validated contract.

### Boundary and encoding

- `prepareHistoryTransition(input: unknown, limits: unknown): PreparedHistoryTransition` in input module returns owned `{packet, limits, budget}`. budget uses internal cumulative CompositionBudget `{serializedBytes,items}`; only owned packet/limits are frozen. No authentication brand. The wrapper/budget are internal implementation data, not public index exports.
- `planHistoryTransition(input: unknown, limits: unknown): HistoryTransitionDraft` in policy module always prepares input itself, with no caller-trusted overload.
- HistoryTransitionError.code: INVALID_HISTORY, HISTORY_UNAVAILABLE, HISTORY_CHANGED, FULL_ANALYSIS_REQUIRED, OTHER_PROVIDER_REVALIDATION_REQUIRED, RESOURCE_LIMIT_EXCEEDED. Message equals code; no payload/path/SQL/environment echo.
- Three limit fields must be positive safe integers, no extras/default. Preflight chargeCompositionJSON before parsing/cloning; reuse descriptor/proxy/Unicode checks, no getter/custom toJSON invocation. Unsafe/malformed ⇒ INVALID_HISTORY; only NativeCompositionError RESOURCE_LIMIT_EXCEEDED maps to the same bound code.
- Charge input once, every derived diff/decision/reference when added, then final serialized result once against one cumulative budget. No double-charge of owned copy. Maps/sets are bounded by charged inputs; this is not a heap proof. Boundary/one-below tests derive consumption, not new profile numbers.
- Draft-only encoding: recursively sort object keys ordinal UTF-16, preserve array order, JSON UTF-8, SHA-256. Pin Unicode/key-order vectors independently. No existing codeActivationDigest/tuple codec/Canonical ID/owner-map/wire checksum/valueDigest changes. Syntax valueDigest remains an opaque existing identity, not a new hashing algorithm.
- Sorted/unique arrays: inventory `(path,id)`; contracts providerId; units id (sourceFileIds sorted id); snapshots id; nodes/edges id; supports `(factType,providerId,providerFactId,evidenceId)`; coverage `(unitId,facet)`; Syntax origins id; observed supportDependencies typed ProviderFactRef. Dependency unitIds sorted id. Reject duplicate/order violations; no localeCompare.

### Relation and consistency rules

1. Validate IR schemas and repo/revision references. Inventory includes OTHER/zero-fact entries; id/path unique. Extraction scope matches B1-A: SOURCE/TEST, TEXT, sensitivity other than SECRET, languageHint java/python. Unsupported target scope ⇒ FULL_ANALYSIS_REQUIRED, no fallback/read permission. OTHER census entries remain without extraction.
2. Native units: one PYTHON_FILE per eligible Python id and one JAVA_GROUP of all eligible Java ids, including zero-fact files. Foreign units use PROVIDER_SCOPE with nonempty full declared dependencies; null support dependencies mean unavailable proof. Units/provider/support dependency mappings agree. No ProviderFactId prefix, extension or null-range inference. Each candidate Source-backed range belongs to a declared dependency; range-less Java containers depend on the whole Java group. Every referenced Provider has one contract identity. Preserve unchanged unit IDs; target-unit declarations cannot redefine an unchanged unit to bypass old dependencies. Raw Python source-to-fact ownership remains a declaration here, not authenticated raw-v5 evidence.
3. Each support has ACTIVE Evidence, matching snapshot/binding/link/fact key and its own original R009 candidate. Existing providerEvidenceId must match. Each support valueDigest must equal the local draft digest of strict {kind: DECLARED_HISTORY_CANDIDATE_V1, candidate: canonical}; this pins the original candidate copy including confidence, without replacing any Canonical/SupportRef digest. A changed current candidate with an updated valid local digest is still HISTORY_CHANGED; replacing only the candidate/winner without its recorded digest is INVALID_HISTORY. Consistently forged candidate+digest data is not authenticated by this check. Snapshot repo/revision/outcome SUCCEEDED; preserve origin fingerprint/times even if older than current activation. Reconstruct one validation observation per origin snapshot and use collectMergeSupports on that group; never combine historical same-Provider snapshots as one new MergeInput. Supply deterministic internal inputPath for selector context; strip that generated path and the private dependencyUnitIds/valueDigest fields when comparing collectMergeSupports output to origin support relations. Duplicate ACTIVE typed ProviderFactRef or missing candidate ⇒ INVALID_HISTORY; never pick latest or copy winner. Keep zero-fact origin snapshots used by coverage/Syntax.
4. Validate selected old nodes/edges against existing selectMergedFacts on the original support candidates, including existing closure/selection semantics. This is validation of old declared state, not assembly of a new graph. Foreign candidates are checked against old inventory. Existing original candidates remain distinct from selected confidence/winners.
5. Native unit coverage uses exactly existing scoped facet names: Java JAVA_CODE_V2 and FRAMEWORK_SYNTAX_OBSERVATION_V1; Python PYTHON_SYNTAX_CODE_V1 and FRAMEWORK_SYNTAX_OBSERVATION_V1. JAVA_CODE_V2 refers to B1-A's already validated five-capability Java composite; this packet cannot authenticate the underlying child run. Every facet row references a compatible SUPPORTED/COMPLETE origin snapshot and covers the entire unit, even zero facts. Foreign rows use that Provider's actual supported/complete facets; no invented mandatory foreign facets. Syntax origin has valid unit/provider/snapshot references and same repo/revision as old state; its recorded basis may be older, never relabelled as current. Origin snapshot startedAt/completedAt are ordered as existing UTC schema values; any new snapshot ID must differ from all historical snapshot IDs, and cannot repurpose a historical origin. No Canonical Syntax payload accepted.
6. History/current both absent ⇒ HISTORY_UNAVAILABLE, including initial empty Source. Code without history ⇒ FULL_ANALYSIS_REQUIRED. History without current ⇒ HISTORY_CHANGED. Present history must match expectedActivationId/expectedOldBasis; current must equal history.state completely, including original candidate confidence, snapshots, coverage, selected facts, membership, locator/contracts. A well-formed differing current ⇒ HISTORY_CHANGED even for equal basis/fingerprint. Malformed intrinsic relations ⇒ INVALID_HISTORY, not normal absence. history/current both absent requires both expected fields null; a present history requires both expected fields non-null, otherwise INVALID_HISTORY.
7. Target repository mismatch ⇒ INVALID_HISTORY; cross-revision or locator mismatch ⇒ FULL_ANALYSIS_REQUIRED. Parent may name an older same-repository revision but grants no cross-revision reuse. Full ancestry and physical authenticity remain C obligations.

### Exact result and policy

```ts
export interface HistoryTransitionDraft {
  readonly kind: 'TRANSITION_DRAFT' | 'NO_OP_DRAFT';
  readonly activationId: string;
  readonly oldBasis: RepoBasis;
  readonly targetSource: TargetSource;
  readonly historyDigest: Digest;
  readonly ledgerDigest: Digest;
  readonly diff: readonly {
    readonly kind: 'UNCHANGED' | 'ADDED' | 'MODIFIED' | 'REMOVED';
    readonly before: SourceFile | null;
    readonly after: SourceFile | null;
  }[];
  readonly supportDecisions: readonly {
    readonly evidenceId: string;
    readonly action: 'RETAIN' | 'SUPERSEDE' | 'INVALIDATE';
    readonly replacementEvidenceId: string | null;
  }[];
  readonly addedEvidenceIds: readonly string[];
  readonly survivingFactKeys: readonly { readonly factType: 'NODE' | 'EDGE'; readonly id: string }[];
  readonly coverageOrigins: readonly HistoryCoverage[];
  readonly syntaxRequirements: readonly {
    readonly originId: string;
    readonly action: 'REVALIDATE_FINAL_BASIS' | 'RETIRE_ORIGIN';
  }[];
}
```

- Diff by id across complete inventories; every id once, sorted id. UNCHANGED compares every SourceFile field. ADDED/REMOVED have one null side; MODIFIED same id with any unequal field. Removed before/path/fingerprint comes only from old declared manifest, no caller removed list. Altering old history alone is HISTORY_CHANGED/INVALID_HISTORY; mutually consistent forged packets cannot be authenticated by this pure API.
- Existing-id classification/language scope transitions ⇒ FULL_ANALYSIS_REQUIRED. SECRET/BINARY/unsupported target scope also refuses. Cross-diff id/path reuse and swaps that cannot satisfy current strict wire partitions ⇒ FULL_ANALYSIS_REQUIRED; no wire weakening. A normal same-id path change without partition conflict is MODIFIED, not content-only unchanged.
- Observe added/modified Python units. Any Java change or Native contract change requires the entire target Java group; Native contract change also reobserves all target Python. Foreign contract/dependency change/deletion or null proof ⇒ OTHER_PROVIDER_REVALIDATION_REQUIRED before producing any partial draft.
- Observation may be null only for exact no-op or removal-only where all affected Native units disappeared and no remaining Java group requires refresh. Otherwise missing observation ⇒ FULL_ANALYSIS_REQUIRED. A non-null observation declares exactly required target units, matching target fingerprint/revision, one new Native snapshot, fresh unique snapshot/Evidence IDs, SUCCEEDED and DECLARED_SUCCEEDED. Extra reobservation refuses. requestIdentity/outputIdentity and settlement are declarations, not actual run/late-settlement proof. Invalid/PARTIAL/FAILED/CANCELLED declaration ⇒ INVALID_HISTORY. Removal-only null observation is a draft, never fake NOT_APPLICABLE or Apply authority.
- Collect new supports through existing collectMergeSupports. supportDependencies maps every new typed ref exactly once to observed units and covers Source-backed ranges; coverage includes all observed zero-fact units. No selected/full next graph. Inconsistent new Source/unit mapping ⇒ INVALID_HISTORY.
- Old Native support: untouched exact units/Source/contracts ⇒ RETAIN exact origin. Changed unit completely observed with same typed ref ⇒ SUPERSEDE old Evidence with replacement new Evidence. Complete scoped observation without that ref, or all dependencies physically removed ⇒ INVALIDATE. Java group change requires full remaining group observed before retiring its old facts; loss of one member does not grant arbitrary retirement outside observed scope.
- Foreign valid support always RETAIN even when same FactKey loses Native support. survivingFactKeys is the deduplicated set of remaining old/new references only; no next merged graph or closure qualification. B1-B2 owns candidate assembly/selection/complete closure.
- coverageOrigins retains untouched unit rows and replaces observed rows; removed units exit. This is declared complete unit coverage, not snapshot/full-activation authority. Empty target census represented literally.
- Unchanged Syntax dependency ⇒ REVALIDATE_FINAL_BASIS; changed/removed ⇒ RETIRE_ORIGIN. No reanchoring/payload change; final owner/basis/valueDigest closure belongs to C/D. Even NO_OP grants no Knowledge freshness.
- NO_OP_DRAFT only when targetSource/inventory, contracts/locator and full current/history membership match, observation null. No new snapshot/Evidence/times. Otherwise TRANSITION_DRAFT after all checks.
- historyDigest binds complete history. ledgerDigest hashes strict `{historyDigest, expectedActivationId, expectedOldBasis, target, observation, diff, supportDecisions, addedEvidenceIds, survivingFactKeys, coverageOrigins, syntaxRequirements}` with the local encoding. No replacement of old digests/checksum. Output recursively frozen, no budget counters/trust flags.
- Output supportDecisions sorted evidenceId, addedEvidenceIds sorted id, survivingFactKeys sorted `(factType,id)`, coverage `(unitId,facet)`, syntaxRequirements originId. replacementEvidenceId null except SUPERSEDE. RETAIN/INVALIDATE/SUPERSEDE partition every old support exactly once.
- Error order: unsafe/limits/shape/broken intrinsic relations; then history/current presence/expected/full-state mismatch; then target repo/revision/locator/scope/diff representability; then foreign revalidation; then exact observation; then decisions/output budget. Each negative fixture isolates a failure unless explicitly testing precedence.

## Independent Fixture and traceability

ID `p1-history-transition-draft-v1`, root `fixtures/phase1/history-transition/`. Follow neighboring B1-A strict Fixture Manifest: schemaVersion1, category code-intelligence, phase1, languages/frameworks empty, capabilities `[HISTORY_TRANSITION_DRAFT_ONLY]`, inputs cases/provenance JSON, expected cases JSON, criticalFacts empty, qualityGates empty. cases.json enumerates these families and references literal `cases/Hxx/input.json` / `cases/Hxx/expected.json` files/variants; all are SHA-frozen before product. No Runtime Syntax profile catalog entry, new metric or numeric gate.

| Family | Expected behavior / accepted design anchor | Task |
| --- | --- | --- |
| H01 absence | absent/absent HISTORY_UNAVAILABLE; Code/no history FULL_ANALYSIS_REQUIRED; history/no Code HISTORY_CHANGED (§7) | T1 |
| H02 identity | valid PRESENT; bad parent/binding/Evidence/missing R009/duplicate typed ACTIVE reject (§4) | T1 |
| H03 original candidate | distinct original candidates versus selected winner; winner substitution rejected (§2/5) | T1 |
| H04 stale current | same basis/fingerprint; changed confidence/foreign support/coverage/membership/snapshot ⇒ HISTORY_CHANGED (§7) | T1 |
| H05 diff | literal full Source diff; same-content metadata changes still MODIFIED (§5) | T2 |
| H06 refusal | cross-revision/locator/classification/secret/binary/language/id-path conflict/fake old removed fingerprint (§5/8) | T2 |
| H07 Python only | changed Python observation; unchanged Python and complete Java retain (§5) | T2 |
| H08 Java only | full target Java incl range-less package; unchanged Python retains (§4/5) | T2 |
| H09 both/removal | both changed; Python-only removal null observation; remaining Java group requires observation (§5) | T2 |
| H10 foreign survivor | Native withdrawal and foreign dependency unchanged retains other origin/FactKey (§5.3) | T2 |
| H11 foreign expired | changed/deleted/null Source dependency or contract ⇒ OTHER_PROVIDER_REVALIDATION_REQUIRED (§5.3) | T2 |
| H12 lifecycle | same ref supersedes; complete scope absence invalidates; false freshness/partial/failed/cancelled reject (§5) | T2 |
| H13 no-op | exact match, origins/times preserved; extra observation refuses; no trusted/freshness fields (§5) | T2 |
| H14 zero facts | empty census/zero-fact Source complete coverage, missing rows reject (§6) | T1/T2 |
| H15 Syntax | old basis allowed only as origin; final-basis obligation, changed-source retirement, bad repo/revision/digest rejects (§6) | T2 |
| H16 mutable history | differing current cannot revive old history; frozen owned output; consistent forgery still only declared draft (§7/8) | T1/T2 |
| H17 unsafe | getter/proxy/toJSON/nonplain/cycle/invalid Unicode, no callbacks (§8) | T1 |
| H18 bounds/encoding | cumulative input/derived/output limits, depth/items/overflow, Unicode/key-order vectors (§8) | T1/T2 |

18 are family IDs, not a performance/success threshold. Variants are authored independently; expected digests use a separate scratch reference to the pinned encoding, not product policy/merger-generated goldens. Loader may synthesize adversarial proxies but not expectations. Actual chain ownership, request/output/late-settlement authenticity, Syntax closure, lock/CAS/SQL/recovery/readers remain **C/D missing evidence**, never mock success.

## Task T1: Owned packet and independent Fixture

**Files:** Create fixture/loader, input module and input test named above; no policy yet or old product edits.

**Interfaces:** Consumes existing IR schemas, collectMergeSupports/selectMergedFacts/providerEvidenceId, `chargeCompositionJSON(value, limits, budget): string`. Produces `prepareHistoryTransition(input: unknown, limits: unknown): PreparedHistoryTransition`, exact packet/types/error and internal budget for T2. Also exports private `historyDraftDigest(value: unknown, limits: HistoryTransitionLimits, budget: CompositionBudget): string` for bounded canonical encoding/hash, without a public index route. Every canonicalized temporary value is counted before hashing; its serialization counts as a derived representation. Packet input and final output charges still apply.

- [ ] 1. Re-read mandatory handoff/specs and accepted plan, verify receipt hashes/branch/HEAD and original fixture bytes. Reconfirm no .codegraph and scope assumptions.
- [ ] 2. Independently author H01..H18 literal families/manifest, schema-check with existing Evaluation, freeze every byte before product. Fixture correction retains original freeze and a new corrected freeze, never overwrites failure evidence.
- [ ] 3. Write H01..04/H14/H16..18 input tests. Assert changed current confidence reports HISTORY_CHANGED after both records validate alone; getterCalls equals0; prepared.packet !== caller input; owned packet frozen; exact error enums and original IDs/times. H03 winner substitution variant must actually differ from original R009 candidate and retain the original valueDigest so the mismatch is observed; a consistently rewritten packet cannot be authenticated.
- [ ] 4. Run T1 test against missing API; retain API RED, not behavior RED. Add callable refusal shell, capture positive-path and broken-binding behavior RED before actual validation implementation. Only Providers build prerequisites, no Native/DB helpers.
- [ ] 5. Implement preflight/relations/ownership/budgets/encoding. Reuse old serializer, schemas/selector/identity; no generic refactor of B1-A. Expose no new authority.
- [ ] 6. Run `node node_modules/typescript/bin/tsc -b packages/providers`; then `node --test --test-concurrency=1 packages/providers/test/history-transition-input.test.mjs`. Require PASS, no skipped required cases. A failed build followed by emitted JS passing is not a build success; preserve all failures.
- [ ] 7. Author-review T1 relations/security/budget fixtures and freeze fresh input/product hashes. Local receipt, no Git stage/commit.

## Task T2: Pure transition decisions

**Files:** Create policy module/test and scripts/test-history-transition.mjs; consume frozen fixture/loader. Only evidence-backed fixture corrections with before/after freeze.

**Interfaces:** Consumes T1 prepare/types/error/budget/digest. Produces `planHistoryTransition(input: unknown, limits: unknown): HistoryTransitionDraft` exactly above. Reuses collectMergeSupports for one declared new Native observation; no selected new graph or Apply payload.

- [ ] 1. Write H05..H16/H18 tests and independent literal oracle. Assert H07 retains old Java Evidence/times, H12 SUPERSEDE has the exact old/new Evidence pair, H10 INVALIDATE of Native leaves foreign FactKey. Pair with H11 removed/changed foreign Source; no stale foreign positive.
- [ ] 2. Capture absent policy API RED, then callable behavior RED for H07 incorrect retention and H11 expired foreign reuse. Failure must reach policy, not fixture setup or schema validation.
- [ ] 3. Implement ordered Source diff/refusals, dependency/contracts, exact observed scope/coverage, lifecycle decisions, surviving references and Syntax obligations. Derive removed only from declared history; preserve original origin. Build exact deeply frozen result/ledger within cumulative budget.
- [ ] 4. Build Providers, then `node --test --test-concurrency=1 packages/providers/test/history-transition-input.test.mjs packages/providers/test/history-transition.test.mjs scripts/test-history-transition.mjs`. All required families/variants pass, no skip. Pin exact-boundary/one-below cumulative final-output budget and caller-mutation results.
- [ ] 5. Review original candidates versus winners, Java whole group/zero facts, foreign survivor/expired pair, Syntax basis and refusal precedence. Preserve pre-product fixture hashes and fresh code/input receipts; do not route existing callers.

## Task T3: Registration, local contract gates and evidence

**Files:** Modify only root package.json test registration; update governance docs named in plan receipt; add implementation author review. Existing registry tests do not hardcode the repository total; new script owns exact51/exact25 and new ID assertions.

**Interfaces:** Consumes T1/T2 modules/fixture. Produces three appended root paths, one discovered Phase1 Fixture and local-only acceptance evidence.

- [ ] 1. In new script assert each new test registered once; fixture discovered once; repository registry50→51, exact Phase1 count24→25, Runtime Syntax profile catalog0. Capture registration RED before package.json edit.
- [ ] 2. Append exactly input test/policy test/oracle paths, no old test reordering/removal and no other script/lock/dependency edit. Full root remains broader than this local scope and is not implicitly run.
- [ ] 3. Run exact companion planned-local-commands.json arrays expanded below: Providers build; three new tests plus original B1-A24-file cohort sequentially; architecture; scoped formatting and whitespace checks. No Native/DB/Rust/helper cohort. Repeat green batches only for new changed inputs/failure justification.
- [ ] 4. Verify original468 covered Fixture paths and predecessor product/IR/SQL/wire/index/lock/profile/old receipts preserved except explicit product additions, docs and root append. New registry51/exact25/one ID/catalog0; no new gate/profile. Check exact old root registration token sequence is preserved.
- [ ] 5. Record exact commands/input hashes/results/RED/build failures/Fixture IDs and C/D missing evidence in CURRENT_STATUS, traceability and author implementation review. Complete tasks only with tests/Fixture/architecture/docs, not code alone. No commit/push.

## Planned local verification (NOT RUN during planning)

Use installed Node24/TypeScript; no install/network. Companion planned-local-commands.json contains exact arrays reproduced below. Tests may use their existing temporary fixture-registry filesystem cases, but do not create an actual SQLite database, launch Native/helper, run Cargo or collect measurements. Node cohort is27files, not a preclaimed pass count.

```powershell
node node_modules/typescript/bin/tsc -b packages/providers
```

```powershell
node --test --test-concurrency=1 packages/providers/test/native-composition-input.test.mjs packages/providers/test/native-composition.test.mjs scripts/test-native-composition-candidate.mjs packages/providers/test/native-code-syntax-ipc.test.mjs packages/providers/test/native-code-syntax-request.test.mjs packages/providers/test/native-code-syntax-stream.test.mjs packages/providers/test/native-syntax-ipc.test.mjs packages/providers/test/native-syntax-owner-binding.test.mjs packages/providers/test/native-syntax-budget.test.mjs packages/providers/test/python-source-normalizer.test.mjs packages/providers/test/python-normalizer.test.mjs packages/providers/test/java-node-normalizer.test.mjs packages/providers/test/canonical-normalizer.test.mjs packages/providers/test/canonical-fact-identity.test.mjs packages/providers/test/fact-merger-input.test.mjs packages/providers/test/fact-merger-selection.test.mjs packages/providers/test/fact-merger.test.mjs packages/providers/test/native-ipc.test.mjs packages/providers/test/native-ipc-v2.test.mjs packages/providers/test/native-ipc-v3.test.mjs packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs scripts/test-workspace-structure.mjs scripts/test-code-syntax-producer-oracle.mjs packages/providers/test/history-transition-input.test.mjs packages/providers/test/history-transition.test.mjs scripts/test-history-transition.mjs
```

```powershell
node scripts/check-architecture.mjs
```

```powershell
node node_modules/prettier/bin/prettier.cjs --check packages/providers/src/history-transition-input.ts packages/providers/src/history-transition.ts packages/providers/test/history-transition-input.test.mjs packages/providers/test/history-transition.test.mjs scripts/test-history-transition.mjs packages/providers/test/fixtures/history-transition-helpers.mjs fixtures/phase1/history-transition package.json docs/superpowers/plans/2026-10-24-phase1-history-transition.md docs/superpowers/reviews/2026-10-24-phase1-history-transition-implementation-review.md
```

```powershell
git diff --check -- docs/handoff/CURRENT_STATUS.md docs/handoff/DESIGN_AUTHORITY.md docs/handoff/DESIGN_TRACEABILITY.md docs/handoff/PHASE_ACCEPTANCE.md docs/handoff/WORK_BREAKDOWN.md docs/handoff/adr/ADR-020-phase1-contracts-and-evaluation.md docs/handoff/specs/CANONICAL_IR.md docs/handoff/specs/EVALUATION.md docs/handoff/specs/NATIVE_IPC.md docs/handoff/specs/PROVIDER_SPI.md docs/handoff/specs/SECURITY.md docs/specs/native-analyzer-scalability.md docs/superpowers/specs/2026-10-23-phase1-b0b-completeness-proposal.md docs/superpowers/specs/2026-10-24-phase1-b1-composition-design.md docs/handoff/specs/SQLITE_SCHEMA.md docs/superpowers/specs/2026-10-24-phase1-history-support-design.md packages/providers/src/history-transition-input.ts packages/providers/src/history-transition.ts packages/providers/test/history-transition-input.test.mjs packages/providers/test/history-transition.test.mjs scripts/test-history-transition.mjs packages/providers/test/fixtures/history-transition-helpers.mjs fixtures/phase1/history-transition package.json docs/superpowers/plans/2026-10-24-phase1-history-transition.md docs/superpowers/reviews/2026-10-24-phase1-history-transition-implementation-review.md
```

Scoped format checks cover the exact new implementation/test/oracle/Fixture, package.json, plan and implementation-review paths above; governance prefixes receive link/diff checks and preserved-original byte checks, not whole-file formatting. no repository-wide formatting or EOL synchronization. Implementation receipt must list actual expanded paths before execution. Existing historical governance bodies are not bulk-normalized. Full root/global CI remain deferred and NOT_RUN, never reported as passed.

## Exit, review and successors

Plan author self-review checks full spec coverage, matching signatures/properties, executable steps, five risk classes, scope/dependencies and proportion. It is not independent review/integration approval. Planning hash/link/format/whitespace checks are not product test evidence.

B1-B1 exit requires T1..T3 tests+independent Fixture+architecture+fresh reproducible docs, no skipped required family and preserved original evidence. Its acceptance label is LOCAL_DECLARED_HISTORY_TRANSITION_CONTRACT. It does not complete B1-B, Phase1, trusted history, a complete next candidate, actual changed-only performance, Source/run ownership or atomic activation.

B1-B2 separately designs exact delta assembler/new observation+retained supports → complete candidate; B1-C owns authenticated history capture/R011/stage/Syntax basis mapping; B1-D owns lock/CAS/atomic Apply/readers/recovery. Physical SQL, authenticated ancestry, actual run/settlement, final Syntax owner/valueDigest closure and database failure/restart tests remain missing. No existing mandatory gate/threshold is lowered. If these contracts conflict with FROZEN authority, stop the affected work and use DCP governance.

C1 symlink EPERM OPEN; fourC2 lifetimes spent; historical Native timeout UNKNOWN; main39708335128 cancellation unqueried; mutable R4 untouched. P1-04/05/Phase1 exits remain OPEN. Previous526 Node/architecture17 remain historical, not rerun this turn. First executable task after whole-plan approval: T1 independent Fixture/freeze/input RED, no acquisition or DB mutation.
