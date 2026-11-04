## H2-R1 component implemented and locally verified — 2026-10-26

Tasks A..D are complete within **LOCAL_DECLARED_RAW_HISTORY_CANDIDATE_ONLY**, as recorded in the [author implementation review](../reviews/2026-10-26-phase1-declared-raw-history-candidate-implementation-review.md). This supersedes earlier in-progress/not-started wording below; original snapshots/checklists remain historical. Nine Providers sources implement private raw-to-declared-history candidate composition using the original R0 ledger, preserved legacy/new tuple identities, one snapshot and complete unit support/coverage. No Canonical Syntax, final basis, real run/owner, Stage/Store or publication authority is granted.

Actual local final33: **988/988 passed**; focused12: **394/394 passed** (overlap, not summed); architecture17 projects passed; Providers build exit0. Scoped formatter preserved JSON values/raw wire;18 executable/declaration hashes match the tested bytes, rebuild exit0 and affected root82/82 passed. Registry57/exactPhase1 31/catalog0;326 new Fixture files,1511 old Fixture bytes unchanged; one root suffix and21 exact structural substitutions. Independent64-case/ten-family corpus,18 controls and original RED/failed attempts are traceable in the review and .superpowers/sdd/2026-10-26-phase1-declared-raw-history-candidate/.

Evidence limitation: the task-local logger overwrote three original detailed JSON reports with run metadata; original terminal logs/inputs/seals and all predecessor evidence survive. Replays are explicitly NOT_ORIGINAL; the review discloses loss and the corrected immutable recorder. Do not claim complete original report preservation. This is author-only component acceptance, not independent/merge/full-phase acceptance.

Full H2/H3 DESIGN_BLOCKED; confidence policy NOT_SELECTED; H4/H5/P1-04/05/Phase1 OPEN. DB/Stage tests, actual Native/helper/collector/resource qualification and cloud CI remain unexecuted, never waived/passed. No new dependency, numeric/profile policy, DB, Native, calibration, cloud/Git write, worktree/session or agent. C1EPERM/C2spent/Native timeout UNKNOWN/main cancellation settlement unqueried/R4 mutable restrictions persist. Existing contracts and gates remain. Final reproducible seal: .superpowers/sdd/2026-10-26-phase1-declared-raw-history-candidate/implementation-verification.json.

## H2-R1 exact package approved; execution in progress — 2026-10-26

User explicitly approved [Tasks A..D](../plans/2026-10-26-phase1-declared-raw-history-candidate.md) for sequential same-session implementation. This accepts nine Providers source files,326-file independent corpus,one root test,21 exact structural replacements and the declared local builds/focused12/final33/architecture. It supersedes pending execution wording below only; no completion result is implied. Task A snapshots and199 pre-product old cases have been verified against original goldens and old receipts;B/C/D remain NOT_STARTED. All4891 plan-seal entries matched at execution start.

No Syntax confidence value or Canonical Syntax/finalbasis/Stage/Store/run authority is granted. No DB,Native/helper/calibration,dependency/profile/cloud/Git action or new worktree/session/agent. FullH2/H3 DESIGN_BLOCKED;H4/H5/P1-04/05/Phase1 OPEN. Prior risks and original byte/EOL/evidence suffixes remain intact. Execution ledger: .superpowers/sdd/2026-10-26-phase1-declared-raw-history-candidate/progress.md.
## H2-R1 written design accepted; concrete task package pending — 2026-10-26

The user explicitly approved the [R1 written design](2026-10-26-phase1-declared-raw-history-candidate-design.md), including legacy unit-id preservation/new-unit tuple identity, one Native snapshot with exact observed-unit dual coverage, and fixed self-validating continuation on the original R0 ledger. That supersedes earlier design-PROPOSED wording only. The [A..D concrete plan](../plans/2026-10-26-phase1-declared-raw-history-candidate.md) and [author plan review](../reviews/2026-10-26-phase1-declared-raw-history-candidate-plan-review.md) are REVIEW_PENDING; all tasks NOT_STARTED and implementation NOT_AUTHORIZED.

The package fixes nine Providers sources,326 independent Fixture files/64 cases/ten families,one root test,21 exact structural replacements in seven old scripts,Providers-only builds and focused12/final33/architecture. Existing registry56/exactPhase1 30/catalog0 and all1511 Fixture bytes remain unchanged;57/31 is prospective only. Plan-start4871 predecessor hashes matched. No product/Fixture/test/registration/build/DB/Native/helper/calibration/profile/dependency/numerical policy/cloud/Git action or new session/worktree/agent this turn.

This is only LOCAL_DECLARED_RAW_HISTORY_CANDIDATE_ONLY planning. Full H2/H3 DESIGN_BLOCKED,confidence policy NOT_SELECTED;final Code/Syntax/Stage/Store/run and H4/H5/P1-04/05/Phase1 gates remain OPEN. Old Stage tests using DatabaseSync are excluded and not marked passed. Original documents/evidence/EOL and C1EPERM/C2spent/Native timeout UNKNOWN/main cancellation settlement unqueried/R4 mutable restrictions persist. Exact planning evidence: .superpowers/sdd/2026-10-26-phase1-declared-raw-history-candidate/plan-review.json.
# Phase1 H2-R1 raw to declared history candidate design

Date: 2026-10-26. Status: PROPOSED / REVIEW_PENDING.
The user selected the history-candidate bridge as the next design direction. That choice authorizes this design, not the identities below, an executable task package, product implementation, a confidence value or any actual run.

## 1. Intent and checked baseline

Close the remaining pure Providers gap between H2-R0 raw admission and the existing declared delta support candidate. A successful local result would assemble normalized Code pairs, dependency units, complete unit coverage and original supports under one logical budget, then reuse H0 transition rules and the existing selector. Proposed exit: LOCAL_DECLARED_RAW_HISTORY_CANDIDATE_ONLY.

The R0 seal was freshly checked: all 4864 SHA256 entries matched, with no missing file. Its 876 passing scoped tests, 343 overlapping focused tests, Providers build and architecture17 are historical evidence, not rerun in this design turn. Source and documents are the uncommitted C worktree at cc5a8cb571986c5e56ed04053b2c96ef500fcacb. D:/workspace/CodeAtlas is not silently substituted. No .codegraph exists.

Current [R0 implementation review](../reviews/2026-10-26-phase1-declared-delta-raw-admission-implementation-review.md), [history/Stage DCP](2026-10-25-phase1-r011-history-stage-contract.md), [S0 design](2026-10-26-phase1-declared-observation-scope-design.md) and [mapping annex](2026-10-25-phase1-syntax-mapping-confidence-design.md) control the predecessor boundary.

No Canonical Syntax, final Code basis, origin/projection id, Stage/lease/owner authentication, actual Source capture, run eligibility, DB write or production route is included. Full H2/H3 remain DESIGN_BLOCKED and the numerical policy remains NOT_SELECTED. Existing Code confidence rules are reused only for Code; they are not a Syntax policy.

## 2. Call-path findings

| Current source                                                                                                                                        | What exists                                                                                                                                               | Remaining gap                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [R0](../../../packages/providers/src/declared-delta-raw-observation.ts)                                                                               | Calls S0 once; owns strict metadata and validated raw; retains packet/scope/limits and the original mutable budget; exact request/output identities       | Does not emit a ProviderSnapshot, normalized fresh observation, unit identities, dependencies or coverage |
| [history input](../../../packages/providers/src/history-transition-input.ts)                                                                          | Strict declared packet/state validation; native supports depend on exactly one unit; complete native coverage requires Syntax and the relevant Code facet | Unit ids are validated declarations, not an existing deterministic allocator                              |
| [history transition](../../../packages/providers/src/history-transition.ts)                                                                           | Required descriptors preserve oldId; one surviving Java group and Python file units; oldId equality is required on reobservation                          | Current public preparation reparses an input and starts its own ledger                                    |
| [delta candidate](../../../packages/providers/src/delta-support-candidate.ts)                                                                         | Checks all retained and fresh original supports, references, coverage, snapshot registry and existing selected winners                                    | Public entry invokes the old history preparation; it cannot consume R0 by resetting the operation budget  |
| [full composition](../../../packages/providers/src/native-composition.ts) / [full input](../../../packages/providers/src/native-composition-input.ts) | Existing Java/Python mapping and one Native snapshot construction                                                                                         | Full inventory/no-removal admission remains mandatory; it is not a delta adapter                          |
| [tuple encoder](../../../packages/providers/src/identity-tuple.ts)                                                                                    | Unicode-safe, length-prefixed SHA256 identity tuple                                                                                                       | No approved history-native-unit domain currently exists                                                   |

A matching digest or DTO remains DECLARED_INPUT, never an authentication proof. Contract extractor/normalizer/policy strings remain declarations; this design does not invent a map from these strings to verified executable versions.

## 3. Approaches and selected direction

The user chose the recommended history-candidate design before this document was written.

Recommended: one private raw-to-declared-candidate entry, composing R0, fixed unit/dependency/coverage assembly and self-validating history/candidate continuation under the same ledger. Identity, zero-fact coverage and continuation belong in one reviewed package because separately passing components would not prove this boundary.

The other feasible sequencing option is to review the confidence evidence first. It advances a different blocker but leaves this Code/history gap open; the user chose the bridge first.

Caller-supplied unit ids, coverage, trusted Prepared packets, a selector callback or a reset-through-public-wrapper adapter are excluded: they leave caller assertions at the boundary this package must derive. Relaxing the full reader, renumbering old history or adding a second merger is also excluded.

## 4. Entry, ownership and outputs

Proposed module-only entry name: composeDeclaredDeltaRawSupportCandidate(input, metadata, requestBytes, outputBytes, limits). It accepts the same untrusted values as R0; no caller-provided unit table, observation, ledger, normalized pairs, prepared object, scope, policy callback or authority flag is added. It calls R0 internally exactly once.

Only OBSERVATION_REQUIRED is accepted. Existing S0/H0/delta routes continue to handle NO_OP and NO_OBSERVATION, including deletion-only cases; extra raw is refused. A required observation may include native/OTHER deletions, but all removals remain in the Source scope and only the approved native projection appears on the wire.

The owned result contains the existing DeclaredDeltaSupportCandidate shape plus the validated immutable raw observation needed for later Syntax mapping, tagged DECLARED_INPUT. Exact outer name/field layout and changed file list must be fixed in the subsequent reviewed plan. No Buffer, mutable ledger, Prepared packet, capability token, readiness flag or new package-index export escapes. The candidate is not a complete DeclaredActivationState and does not claim its merged Code is a final authenticated basis.

Snapshot, pairs, units, dependencies, coverage, raw references and final output must be owned/frozen as appropriate; shared raw may be retained by reference only when already owned and immutable. Each separately materialized representation is charged. No caller input is mutated, including on failure.

## 5. Proposed unit identity contract — explicit approval required

Reuse every non-null S0 required descriptor oldId verbatim, after the existing history checks. This preserves arbitrary valid historical ids and Java-group continuity when membership changes. No backfill, rename, reinterpretation or rewriting of old origin/coverage members.

Only a descriptor with oldId=null receives a new deterministic id:

    digestIdentityTuple('history-native-unit-v1', [
      packet.target.source.repositoryId, packet.target.source.revisionId, packet.target.repositoryLocatorDigest,
      'native', kind,
      ... (kind === 'PYTHON_FILE' ? [the sole sourceFileId] : [])
    ])

Use the existing tuple function and its exact domain-prefixed return value. Fields are well-formed strings; kind is JAVA_GROUP or PYTHON_FILE. Java denotes the repository's one native Java group, so its file membership is not part of the id. Python denotes one Source identity. A revision/locator change already requires full analysis under S0; this rule promises no cross-revision continuity.

Do not include source fingerprint, request/snapshot/time/providerSyntaxId, contract version, Code digest, confidence or current membership. Those describe observations/contents, not the dependency-unit identity. Source replacement/path reuse and incompatible history continue to follow S0's existing full-analysis refusal.

Check uniqueness against all old unit ids and all units allocated by this operation. A derived id colliding with any different existing unit is an INVALID_CONTEXT refusal; do not salt, increment, drop the old unit or silently trigger a real full run. A reobserved legacy unit continues to use oldId even if it differs from the new formula. Removed units are not retained in the current candidate; immutable older manifests remain untouched.

This new domain and old/new identity rule are a proposed DCP addition, not an approved implementation detail or a new numeric threshold. Independent literal tuple byte encodings/digests and legacy/collision controls are required before implementation.

## 6. Raw to fresh observation

### 6.1 Normalize original facts, not winners

Reuse existing Java node/edge and budget-aware Python Source normalizers. Preserve original typed Provider NODE/EDGE refs, Canonical ids, raw resolution and existing Code confidence. Do not resolve names, infer cross-file links, synthesize facts for zero-fact units or use the full-only reader as a shortcut.

Java normalization consumes the entire required Java group from admitted v2 data. Python consumes the admitted v5 Code events and exact required Source files, with no new language/cross-file resolver. A module without sourceRange follows only the established exact module-path-to-Source rule where the existing normalizer supports it; ambiguous/missing attribution refuses. Validate all original pairs, duplicate identities and edges before selecting winners. Reusing normalizers may repeat temporary Python work already performed by raw validation; charge the repeat and do not refund the earlier work.

### 6.2 One declared Native snapshot

Build one ProviderSnapshot from admitted enclosing metadata/target using the current full composition's schema, timestamps, diagnostics ordering and capability names. Preserve the original snapshot id/providerVersion/runtimeVersion; do not synthesize one snapshot per file or per language, and do not advertise capabilities for an unobserved language.

Capability names are the existing full-composition order filtered to observed units: JAVA_CODE_V2 if a Java group is required; PYTHON_SYNTAX_CODE_V1 if Python units are required; FRAMEWORK_SYNTAX_OBSERVATION_V1 for the admitted Syntax observation. Each is SUPPORTED/COMPLETE only after R0's complete raw checks. Snapshot-level capability completeness applies to the declared observed scope, not untouched Source or a truthful actual run. History coverage supplies exact unit membership.

Keep diagnostics from admitted Java then v5 events in the existing full rule order; validate with ProviderSnapshotSchema. Do not copy arbitrary caller capabilities/outcome into the generated snapshot. The full reader's current construction and errors must remain exact if a private helper is extracted.

### 6.3 Units, supportDependencies and zero-fact coverage

For each S0 required descriptor construct exactly one unit with the approved old/new id, native provider, original kind and the complete sorted Source-id list. Required-unit coverage cannot be inferred from emitted facts.

Construct exactly these existing facets for every observed unit, including an empty Python file or zero-fact Java group: FRAMEWORK_SYNTAX_OBSERVATION_V1 plus JAVA_CODE_V2 or PYTHON_SYNTAX_CODE_V1, COMPLETE, with the new enclosing originSnapshotId. Use old history ordering: units by historyCompare(id); coverage by unitId then facet.

For every normalized original Code support create exactly one supportDependencies row keyed by full typed ProviderFactRef. Java facts depend on the observed Java group. Python facts depend on the sole observed Python file owning the original fact by the existing Source/module attribution rule. A missing/ambiguous owner or a fact outside the required set refuses; do not guess by display name or use an empty dependency list. Sort rows by the existing typed-ref order and unitIds by historyCompare. All originals, including future nonwinners, must be represented exactly once.

No dependency rows are invented for Syntax events: the current table describes Code merge supports. Syntax-to-unit/origin assembly remains a later mapping responsibility. Raw request/output hashes are copied exactly from R0 provenance; settlement is DECLARED_SUCCEEDED only, with no actual-run status.

## 7. Self-validating continuation and cumulative accounting

A fixed internal continuation connects the newly constructed DeclaredNativeObservation to the owned R0 packet/scope. It must validate the new observation with the current schema and all H0 observation semantics: required unit match/oldId, snapshot freshness and target, original support completeness, dependency ownership and coverage. Reuse the existing history rules and delta selector/closure; do not maintain a second algorithm.

The reviewed plan must identify exact shared kernels and every caller before refactoring. Old public prepareHistoryTransitionDraft and composeDeclaredDeltaSupportCandidate retain their existing fresh-start wrappers and exact outputs/errors/counters. The new path reuses the original R0 limits and the same mutable budget object throughout; neither calling old wrappers with larger limits nor subtracting to create a replacement ledger is acceptable.

An internal continuation is not caller-trusted Prepared authority. The top entry must construct its own R0 state and observation; no public shortcut accepting a forged Prepared DTO is introduced. Necessary validation passes may repeat work only if charged on the same ledger. Do not serialize/reparse a packet to reset counters or claim provenance. Type branding, matching hashes and module visibility alone are not security proofs.

Pre-retention charging covers input views, maps/keys, identity encoding buffers, Java/Python normalized pairs, snapshot/diagnostics, unit/dependency/coverage arrays, merge supports, history drafts and digest encodings, selector inputs/results and owned output. Existing hard wire caps, explicit maxSerializedBytes/maxItems/maxDepth and safe arithmetic remain; no defaults, refunds, truncation, profile values or callback-selected limits. New tuple hashing work needs an explicit bounded charge plan before invoking the encoder; its independent expected accounting cannot be inferred from the new product's counters.

This remains logical accounting. Heap/RSS/time, actual capture reservation and HOST/NATIVE resource qualification are not established.

## 8. Errors, recovery, storage and security

Preserve old public error classes/codes/messages. A new private safe wrapper may retain existing raw, HistoryTransition, normalization and candidate error codes; the plan must enumerate precedence and mapping. Identity collision is INVALID_CONTEXT; incomplete raw retains R0's refusal; dangling original references remain a refusal; resource errors must not be swallowed as invalid facts. Messages contain safe codes only, no literals/paths/SQL.

All output is atomic and unpublished. Failure leaves old Source/history/Code/Syntax/pointer and original evidence unchanged; no partial candidate escapes. No SQL/schema/migration/DB, file interpretation, expression evaluation, process/shell/network/LLM, Native helper, profile or dependency. Preserve provider-independent IR, SQLite authority, candidate-only LLM, AUTO/MANUAL and ExecutionGraph -> RuntimeFlow -> BusinessFlow. No DEFERRED feature enters.

## 9. Task dependencies and acceptance mapping

This is a design outline, not an executable or authorized plan. Exact files, independent cases, registration substitutions and named local commands are subsequent writing-plans work after approval.

| Unit                                        | Dependency and verifiable result                                                                                                                                                         | Authority / Fixture / gate                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| R1-A independent oracle and old receipts    | R0 exit; freeze independent raw -> pairs/unit/dependency/coverage/transition/candidate expected data before new code; include legacy ids, new Java/Python ids, collision and empty facts | DCP sections3/5; S0; proposed section5; partial HS-IDENTITY/HS-RAW; new Fixture missing |
| R1-B normalization and observation assembly | R1-A; exact original pairs, one snapshot, every support dependency, every required unit's dual coverage and preserved checksums; missing/ambiguous ownership refuses                     | Provider SPI; existing normalizers; HS-RAW/HS-OWNER/HS-BUDGET components only           |
| R1-C history/candidate continuation         | R1-B; old wrapper parity and same-ledger new path; retained losers/all refs, deletions, selector closure, zero facts and refusal-before-retention controls                               | H0/B1-B2; DCP4.1/5; HS-RAW/HS-BUDGET/HS-IDENTITY partial                                |
| R1-D local closure/review/docs              | R1-C; Providers-only build, scoped Node fixtures/compatibility/Evaluation/registry, architecture, protected bytes and synchronized documentation                                         | AGENTS / implementation protocol; author-only review limits retained                    |

These tasks are sequential. Oracle review can be read separately, but identity, coverage and continuation cannot independently choose contracts or counters. No new session/worktree/agent or concurrent long test.

Minimum independent matrix: new vs legacy unit identities; Java membership add/remove and reobserve; Python add/modify/zero facts; partial Python with retained Java; mixed requirements; native/OTHER removal; per-facet coverage forgery; original same-name refs/losers; cross-unit/missing/ambiguous dependencies; snapshot/target mismatch; retained dangling edges; exact/one-below cumulative budgets, overflow/depth, early refusal before later bad input; immutable inputs/outputs and no index leakage. Retain old full partial/removal refusal and NO_OP/deletion-only behavior. Counts and expected bytes must be fixed by the plan, not invented here.

Missing gates remain explicit: a newly frozen R1 corpus/old receipts, exact charge ledger, detailed refactor/caller proof, version-declaration limits, actual owner/Source/run proof, Syntax numerical policy/mapping, final Code identity/Stage/Store and independent integration review. No parent gate is waived.

## 10. Governance, review and requested decision

Proposed changes affect the history-stage DCP (unit identity and continuation sections), ADR-020, Provider SPI, Evaluation/Security, WBS/acceptance/traceability and current status. After design acceptance synchronize their governing statements before coding; do not modify historical source, frozen IR shape, released SQL or existing Fixture roots. This design needs no new ADR number if accepted as an explicit DCP supplement; that is a proposed governance choice, not silent FROZEN reinterpretation.

Author review is [recorded separately](../reviews/2026-10-26-phase1-declared-raw-history-candidate-design-review.md). No independent agent was created under the user's sequential constraint. Design-document checks cannot substitute for implementation or Evaluation evidence.

Requested confirmation: approve this written R1 direction, including the unit identity formula/legacy preservation, one-snapshot unit-scoped coverage and fixed same-ledger self-validating continuation, for concrete task-package refinement only. This does not authorize product/Fixture/script/build work, numerical policy, actual Native/DB, dependencies, cloud CI or Git writes.

C1 symlink EPERM remains open; four C2 lifetimes are spent; historical Native timeout is UNKNOWN, not fixed/flaky; main39708335128 cancellation settlement remains unqueried; R4 mutable post-trial DB is not pristine and was not touched. H4/H5/P1-04/05/Phase1 remain OPEN.
