# Work Breakdown

2026-10-03 written C design approval: user confirmed919d6b7; [six-task native plan](../superpowers/plans/2026-10-03-p05-w3-020-native-refresh-producer.md) awaits review, all tasks unstarted. Order: C1 output contract → retained/shared helpers → real producer → real transition/failure corpus → existing-purpose exact-build calibration with numeric approval → full gates/one branch review. B base confirmation precedes coding; D/E remain separately reviewed subdivisions. No new roadmap task, phase promotion or implementation is claimed; supersedes C-written-review-pending wording below.

P05-W3-020 next packet (2026-10-03): the [written C producer/output design](../superpowers/specs/2026-10-03-p05-w3-020-native-refresh-producer-design.md) awaits user review; no implementation plan/code exists. After spec/plan approval and packet B base confirmation, C1 strict output/correspondence precedes C2 real changed-file producer and task-local differential Fixtures. D Runtime/Store overlay seal and atomic summary activation/admission, then E persisted Evaluation, require separate detailed review. These subdivide the existing parent, not the 14-task roadmap. PR #18 is open with exact ff3f731 hosted CI green; packet B is not yet remotely integrated.

P05-W3-020-B local completion (2026-10-02): seven packet tasks and one review correction pass have complete green equivalent local gates following the explicit stability-profile numeric approval; see CURRENT_STATUS and the two executed plans. Parent P05-W3-020 is not complete, and integrated roadmap count remains10/14. Integration requires explicit user authority; real REFRESH producer/patch-summary activation/differential Evaluation remain subsequent reviewed subdivisions. Earlier Task6/7 pending records below are historical; no added roadmap task or deferred capability.

Packet B execution update (2026-10-02): Task 6 is locally committed as `0b2af73`, with 24 real bootstrap/lifecycle cases, 98/98 expanded focused tests and root 796 pass/0 fail/one existing Windows skip. Task 7 now advertises full v3 `[1,2,3]` after observed RED→GREEN descriptor tests; strict v1/v2, IR v1, capability list and explicit v3 REFRESH refusal are unchanged. The required bootstrap runner obtains the actual descriptor through the production client rather than using a future descriptor. Native integration CI selects Windows/x64 Node 24.15.0 because only that exact environment has reviewed full-transport admission; Ubuntu TypeScript and Windows Rust gates remain. This is configured coverage, not observed hosted CI or Linux bootstrap evidence. Final Task 7 gates/review remain pending; earlier unimplemented/profile-review-blocked wording is historical. Parent REFRESH and original Phase 0.5 exits stay open at 10/14 integrated, with no new milestone or deferred scope.

Task 6 final local gates (2026-10-02): real full-bootstrap lifecycle index now contains 24 executed cases, covering reopen, same-fingerprint token race, complete-source write-lock drift, four rollback points, legacy full/patch success and failure, source reconciliation, unavailable/incompatible read/no-parse, zero-file/zero-fact success, analyzer failure/cancellation, matching read-only/unreviewed pre-observation refusal, R009 compatibility and broken-R010 rejection. Final declared expanded command passes **98/98** (26098.8822 ms). Final exact root Node entry passes **797 total / 796 pass / 0 fail / 1 existing Windows skip** (136997.1949 ms); the initial root failure was the shell inventory missing the plan-required JAVA_NORMALIZER_VERSION export, synchronized without weakening its inventory assertion. Forced 16-project TS build, separate IR type tests, architecture 17, Rust fmt/Clippy and Cargo workspace 94/94 pass; existing MSVC test-linker informational warning is disclosed. Required root native-analysis script now includes the real bootstrap suite after Rust build; Runtime has a dedicated native-bootstrap entry. Node built identity remains the approved repaired build after all forced builds. Local Task 6 gates pass; commit bookkeeping follows. Task 7 advertisement/hosted-platform integration, whole-branch review and real REFRESH remain open; Phase 0.5 stays 10/14. No pnpm-wrapper/hosted-CI, Linux bootstrap, push, PR or merge success is claimed.

## Workstreams

`W0 Foundation`, `W1 IR and Storage`, `W2 Source and Revision`, `W3 Native Analyzer`, `W4 Provider and Plugin`, `W5 Execution`, `W6 CrossRepo`, `W7 Knowledge`, `W8 Agent API`, and `W9 Evaluation and Packaging`.

Phase 0 and 0.5 tasks below are implementation-ready. Each task inherits the definition of done in `IMPLEMENTATION_PROTOCOL.md`. `DESIGN_TRACEABILITY.md` provides the canonical Task-to-Fixture-to-Acceptance-to-Spec mapping and must be updated whenever one of those relationships changes.

## Phase 0

### P0-W0-001 Monorepo bootstrap

Create `apps/cli`, `apps/mcp`, `apps/daemon`, focused packages from the module-boundaries spec, `crates/native-analyzer`, and shared fixture directories. Configure workspace builds, TypeScript, Rust, tests, formatting, and CI. Accept when each package builds independently, CLI/MCP shells start, the crate builds, and CI runs TypeScript and Rust tests. No business logic or database schema.

### P0-W0-002 Architecture dependency rules

Depends on P0-W0-001. Enforce the allowed dependency graph with import linting and a graph test. Accept when injected forbidden edges fail, `ir` has no upper-layer dependency, providers do not depend on knowledge, and apps do not import storage implementations directly.

### P0-W0-003 Runtime bootstrap

Depends on P0-W0-001. Implement `RuntimeBuilder`, explicit `RuntimeDependencies`, configuration bootstrap, and a workspace-context placeholder. Accept when CLI and MCP construct the same `KnowledgeRuntime` without domain-layer inversion.

### P0-W1-001 Common IR primitives

Implement schema-first `EntityId`, `CanonicalId`, `EntityRef`, `SourceRange`, `Confidence`, `ResolutionLevel`, `SchemaEnvelope`, time conventions, and typed errors. Provide Zod schemas, inferred types, JSON round-trips, invalid-boundary fixtures, and version checks.

### P0-W1-002 Source and revision IR

Depends on P0-W1-001. Implement Repository, Revision, SourceFile, ProviderSnapshot, and `COMMIT | WORKTREE | SNAPSHOT` semantics. Prove mutable worktree identity differs from frozen immutable revision identity.

### P0-W1-003 Code fact IR

Depends on P0-W1-001. Implement provider/canonical nodes and edges, unresolved targets, symbol/type/import/reference/call/inheritance/override kinds, and fact keys. Prove provider IDs never masquerade as canonical IDs and unresolved edges serialize without forced resolution.

### P0-W1-004 Evidence model

Depends on P0-W1-001 and P0-W1-003. Implement Evidence, EvidenceStatus, FactEvidence, and ProviderFactBinding. Prove one canonical fact can have multiple independent supports and lifecycle states.

### P0-W1-005 Migration runner

Implement separate repository/workspace manifests, checksums, `PRAGMA user_version`, locking, transactions, sequential upgrades, rerun safety, rollback, and `DATABASE_TOO_NEW`. Fixtures: `migration-empty`, `migration-upgrade`, `migration-failure`, and `database-too-new`.

### P0-W1-006 Repository database R001-R007

Depends on P0-W1-002 through P0-W1-005. Implement `repo_core`, `source_revision`, `provider_runtime`, `code_graph`, `evidence`, `analysis_coverage`, and `diagnostics` migrations with critical indexes. Accept fresh-to-latest and sequential-upgrade tests.

### P0-W1-007 Workspace database W001-W003

Depends on P0-W1-005. Implement `workspace_core`, `repositories`, and `revision_sets`. Knowledge tables are forbidden in Phase 0. Prove revision sets are immutable once frozen.

### P0-W3-001 Native IPC schema v1

Depends on P0-W1-001 through P0-W1-004. Freeze request/event envelopes for `DESCRIBE`, `ANALYZE`, and `REFRESH`; include started, source-file, node, edge, coverage, diagnostic, completed, failed, and patch events. Specify ordering, limits, cancellation, errors, and version negotiation.

### P0-W3-002 Shared protocol fixtures

Depends on P0-W3-001. Add `describe-v1`, `analyze-java-basic-v1`, `refresh-modified-file-v1`, `refresh-delete-file-v1`, `partial-analysis-v1`, malformed JSON, invalid event, incompatible protocol, oversize line, and premature EOF fixtures. TypeScript and Rust must consume the same bytes.

### P0-W3-003 Rust DESCRIBE

Depends on P0-W3-002. Build a native binary using stdin for requests, stdout exclusively for JSONL protocol, and stderr for logs. Return analyzer, protocol, IR schema, language, and capability descriptors through a language-neutral envelope. Prove compatible handshake and explicit rejection paths. See ADR-014; no parser is required in Phase 0.

### P0-W3-004 TypeScript native client

Depends on P0-W3-003. Implement shell-free child spawning, allowlisted environment, streaming decoder, stderr capture, backpressure, timeout, cancellation, validation, and typed errors. Prove protocol corruption cannot partially apply state.

### P0-W4-001 Provider and Plugin SPI

Depends on IR schemas. Implement descriptors, capabilities, full/refresh analysis contracts, plugin detection and extraction contracts, and deterministic routing metadata. Provide contract tests with fake providers/plugins; no Spring implementation.

### P0-W9-001 Fixture registry

Implement manifest discovery, schema versioning, categories, phases, languages, frameworks, capabilities, critical facts, inputs, expected outputs, and quality gates. Invalid manifests fail with actionable paths.

### P0-W9-002 Canonical comparator

Depends on P0-W9-001 and Code IR. Compare expected/actual canonical nodes and edges and classify `MISSING`, `EXTRA`, `SEMANTIC_DIFFERENCE`, and `RESOLUTION_DIFFERENCE` with stable output.

### P0-W9-003 Metric engine and eval CLI

Depends on P0-W9-002. Calculate node/edge precision and recall plus critical-fact recall. Add `ekp-dev eval <fixture>` and machine-readable output. Phase 0 completes only after the Phase 0 acceptance suite passes.

## Phase 0.5

### P05-W2-001 Repository discovery and source scanning

Implement Git/root/branch/HEAD discovery, workspace-relative identity, recursive scanning, language hints, `.gitignore`, EKP include/exclude overrides, generated/vendor/test classification, and binary detection. Fixtures: `basic-java-repo`, `gitignore`, and `generated-vendor`.

### P05-W2-002 File and worktree fingerprints

Depends on P05-W2-001. Implement normalized paths, content hashes, sizes, revision fingerprints, mutable `WORKTREE` revisions, changed-file sets, and startup reconciliation. Knowledge compilation, not indexing, freezes a workspace RevisionSet.

### P05-W3-001 Java parser and symbol extraction

Depends on IPC/IR freeze. Bootstrap Rust plus Tree-sitter Java behind an internal `LanguageAnalyzer` boundary; emit packages, classes, interfaces, methods, fields, constructors, nested types, source ranges, diagnostics, and coverage. Java visitor/resolver logic stays in the adapter; framework meaning stays in Plugins. Fixtures: `java-basic-symbol` and `java-nested-types`. This does not add another language to Phase 0.5.

Use validated indexing configuration as the sole parse-worker mode input (`AUTO` or explicit positive count) and enforce the analysis memory/resource budget. Do not change strict Native IPC v1 solely to carry this control-plane setting.

### P05-W3-002 Imports, calls, inheritance, and references

Depends on P05-W3-001. Support normal/static/wildcard imports; direct/this/static/constructor calls; extends/implements; and initial type/method/field references. Preserve overload ambiguity and unresolved calls. Fixtures include `java-call-basic`, `java-overload`, `java-inheritance`, and `java-unresolved-call`.

### P05-W3-003 Coverage output

Depends on P05-W3-002. Emit eligible, covered, unsupported, partial, and resolution-level statistics per file/capability. Queries and evaluations must surface incomplete coverage.

Distinguish timeout/budget exhaustion, parser exception, unsupported language/capability, syntax-error/partial coverage, and successful zero-fact analysis through existing terminal, diagnostic, and coverage channels where possible. Any wire or persisted snapshot extension needs separate compatibility review.

ADR-015 approves a compatible protocol-v2 `ANALYZE` coverage-statistics payload while retaining strict v1 and the v1 `DESCRIBE` bootstrap. Count recognized source-grounded syntax sites, not unknown syntax-error regions; preserve v1 numeric-statistics-unavailable reporting. Protocol-v2 `REFRESH`, persisted snapshot changes, and query implementation remain outside this task.

### P05-W4-001 Canonical normalizers and fact identity

Depends on P05-W3-002. Normalize provider nodes/edges to language-neutral forms and implement `NodeFactKey`/`EdgeFactKey`. A CALL key includes caller, resolved target or unresolved hint, callsite, and revision semantics.

### P05-W4-002 FactMerger v0.1 and bindings

Depends on P05-W4-001. Merge identical facts, retain multiple evidence/bindings, honor the resolution hierarchy, and aggregate confidence conservatively. Prove removal of one support does not remove a still-supported fact with `two-provider-same-call`.

### P05-W1-010 Full analysis apply

Depends on repository schema and normalization. Stream into staging, validate, use batched SQL within one activation transaction, atomically activate the indexed revision, and retain the previous graph on failure. Analysis coordination must call `CanonicalFactStore`, not compose SQL or commit per node/edge.

Bound pending files, completed results, native output, normalization, and staging with downstream backpressure; do not treat the Phase 0 bounded in-memory IPC result as proof of large-repository streaming apply.

### P05-W1-011 Incremental patch apply

Depends on P05-W1-010 and FactMerger. Atomically support upsert/remove node and edge events, recompute canonical support, and prevent dangling/stale bindings.

Use additive R009 active support candidates and the existing FactMerger selector. A migrated graph without complete per-support candidates must request full analysis before patching. Keep the last graph and activation fingerprint on any invalid patch, stale base, or transaction failure. See the accepted P05-W1-011 design and plan; Rust REFRESH production remains P05-W3-020.

The accepted cross-revision design amendment restricts this task's patch activation to the same mutable `WORKTREE` revision ID. A different ID or immutable target returns `FULL_ANALYSIS_REQUIRED` with the old graph intact. Test both fallbacks and same-ID fingerprint advancement; do not fabricate carried Evidence for unchanged Provider facts.

### P05-W2-010 Change detector

Depends on fingerprints. Produce added, modified, deleted, and renamed changes; delete-plus-add is acceptable for rename in Phase 0.5. Prove stable results across restart.

### P05-W3-020 Native REFRESH

Depends on change detector and patch apply. Consume changed files and emit a validated patch stream. Refresh reparses changed files plus a bounded resolver-dependent set, not the whole repository by default; in-memory incremental trees are an optimization only while alive, and ASTs are not persisted. Fixtures: modify call target, delete class/method, add class/method, and change import.

P05-W3-020 follows accepted ADR-016. Subdivision A is the review-ready [v3 summary/request contract design](../superpowers/specs/2026-09-30-p05-w3-020-v3-contract-design.md) and [implementation plan](../superpowers/plans/2026-09-30-p05-w3-020-v3-contract.md), followed by separately reviewed R010/full-bootstrap, REFRESH producer, Runtime/Store composition and differential-Evaluation packets. Subdivisions do not increase the 14 roadmap task count. Contract-only implementation must not advertise v3/REFRESH or claim the parent task complete.

P05-W3-020's next subdivision B is the [accepted R010/full-bootstrap/atomic-lifecycle design](../superpowers/specs/2026-10-01-p05-w3-020-state-bootstrap-design.md). Its [implementation plan](../superpowers/plans/2026-10-01-p05-w3-020-state-bootstrap.md) is approved for native execution: seven task-sized steps cover B1 persistence/read, B2 full-output/producer, B3 bootstrap/lifecycle and B4 runner integration. Tasks 1–3 are locally complete; Task 3 output validation/corpus and reviewed read/seal profile pass local verification; local Task 3 is complete. The remaining packet tasks stay open. Real REFRESH producer/patch-summary activation and phase differential Evaluation remain subsequent subdivisions; no extra roadmap task or early capability is introduced.

Task 3 numeric approval update (2026-10-01): the user answered the exact reservation question with “继续”. The unaltered report is preserved separately at `fixtures/storage/native-analysis-state/memory-baseline-task3.json`, SHA-256 `a9451c810ae270340cb499cac5dbf01d0fe274b755861a6725b4576eb17815b1`, with capture status unchanged. The current-build Windows read/seal profile now reserves 250,855,424 bytes plus twice retained SQL UTF-8 bytes; Task 2 report/profile is unchanged. Production matching-profile and one-byte-below/refusal checks passed within 83/83 focused tests after explicit RED for the absent current profile. Earlier pending-review/current-build refusal wording is historical and superseded by this approval/install record. Final post-approval root Node regression passes 762 with one existing Windows skip; focused tests pass 83/83, Cargo 88/88, existing real Native tests 25/25, build/type/architecture/fmt/Clippy/format/diff pass. Local Task 3 is complete. Decoder/transport workspace admission is still Task 4 work; no real producer/bootstrap/REFRESH or phase exit is claimed.

Task 4 current state: separate full-v3 Provider transport and required process/memory runners are implemented locally; Runtime purpose admission rejects read-only evidence for `FULL_TRANSPORT`. The user approved the paired current-build Windows reservation of 247,132,160 bytes plus twice retained SQL UTF-8 bytes; exact profile installation and fresh admission/refusal gates pass. Final registered root entry passes 795 with one existing Windows skip; local Task 4 gates are complete, commit bookkeeping follows. Tasks 5–7 remain open. See CURRENT_STATUS for raw-report/corpus identities and commands. No real producer/bootstrap/REFRESH, advertisement, phase exit or milestone change is claimed.

Packet B local execution update (2026-10-02): Task 5 real Rust full-only producer is committed as `4901d97`, with 26 real-v3 tests, combined Native 51/51 and Rust 94/94. Task 6 Runtime/Store draft and B3 test index are in progress; old-profile admission deliberately rejects the changed Node identity. Real legacy token regression justified the ADR-016 internal-count guard refinement. Task 6 still requires reviewed paired calibration, remaining lifecycle tests and fresh gates; Task 7 and all parent real REFRESH/original Phase 0.5 exits stay open. Integrated count remains 10/14.

### P05-W5-001 Graph query and entry-less trace

Depends on active canonical store. Implement get symbol, find symbols, incoming/outgoing edges, and bounded call traversal. Return confidence, coverage, freshness, and source references.

### P05-W8-001 Index, understand, and trace CLI

Expose full/incremental/status indexing, symbol understanding, and code-level trace. Explicitly label results as code traces, not `RuntimeFlow` or `BusinessFlow`.

### P05-W9-001 Phase 0.5 evaluation suite

Freeze symbol, call, overload, inheritance, unresolved, incremental, and provider-merge fixtures. Enforce the numeric gates in `PHASE_ACCEPTANCE.md`, write a machine-readable report with stage durations and peak memory for pinned cold/1-/5-/50-file scenarios, and block Phase 1 promotion on failure. No new numeric latency threshold is implied.

Include a Worker Consistency Fixture that varies effective worker count and parse completion order while comparing normalized Canonical Graph semantics, coverage, and stale-fact state. Report requested/effective worker mode and bounded-resource outcomes; no new numerical performance threshold is set.

## Phase 1 planning package

After Phase 0.5, the Engineering Agent creates reviewed task groups for: framework plugins; `ExecutionGraph` and `RuntimeFlow`; contracts/cross-repository stitching; Document IR/claims; knowledge workflows/identity/reconciliation/publication and the standard Wiki projection; LLM runtime; Agent API/MCP; security; evaluation; and packaging. Use `vulnerability-processing` and `spring-fastapi-kafka` as end-to-end acceptance fixtures. Do not redesign the target architecture or pull Declarative WikiSpec into Phase 1.

The Phase 1 package also scopes a bounded permissioned source-grounded KnowledgeCandidate path and its path-specific Evaluation, progressive L0/L1/L2 Agent consumption, and supported cross-repository System Wiki sections through published Knowledge. Full degradation orchestration is deferred to Phase 2 and is not a Phase 0.5 or Phase 1 dependency; complete DiagramModel/renderer design also belongs to Phase 2.

## Parallelization constraints

In Phase 0, monorepo, basic IR, migration runner, IPC schema, and fixture harness may proceed in parallel after shared names are agreed; Rust analysis waits for IPC and Code IR freeze. In Phase 0.5, scanner, parser, and fixture authoring may proceed in parallel; FactMerger waits for fact identity. Activation and evaluation integration follow normalized facts.
