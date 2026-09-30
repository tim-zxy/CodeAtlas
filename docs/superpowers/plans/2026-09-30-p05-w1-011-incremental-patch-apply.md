# P05-W1-011 Incremental Patch Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a complete validated Provider patch atomically while preserving exact multi-provider support selection and the last committed graph on failure.

**Architecture:** R009 stores each active support's normalized Canonical candidate beside its existing Evidence/Binding. Storage stages and validates the v1 patch, then reselects affected groups through the existing FactMerger under one SQLite transaction. Application owns activation eligibility; Runtime composes the stream and store without making Rust a SQLite writer.

**Tech Stack:** Node 24, TypeScript 7, `node:sqlite`, Native JSONL IPC v1, Zod Canonical IR, Node test runner, existing Fixture registry.

**Spec:** `docs/superpowers/specs/2026-09-30-p05-w1-011-incremental-patch-apply-design.md`

**Accepted amendment:** `docs/superpowers/specs/2026-09-30-p05-w1-011-cross-revision-design-change-proposal.md` limits Phase 0.5 activation to one mutable `WORKTREE` revision ID. Changed-revision or immutable-target input returns `FULL_ANALYSIS_REQUIRED` without mutation.

## Global Constraints

- Read `AGENTS.md` and the Handoff authorities in their required order before changing code, schema, configuration, Fixture, or build files. Record material assumptions and testable success criteria.
- Preserve published R001–R008 SQL/checksums. Add R009 only; shift unpublished Phase 1 repository reservations from R009/R010 to R010/R011.
- Preserve Provider-independent Canonical IR, strict Native IPC v1, ProviderSnapshot/Evidence schemas, FactMerger selection, SQLite authority, and application-owned writes. No new product dependency or numerical Quality Gate.
- Only a complete, checksum-verified `SUCCEEDED` patch may activate. `PARTIAL`, invalid, stale-base, cancelled, or failed streams never mutate the active graph.
- Different base/target revision IDs and non-`WORKTREE` targets are inapplicable in this task; prove controlled fallback and exact last-graph preservation without weakening later phase gates.
- Do not implement the Rust `REFRESH` producer, dependency selection, graph query/CLI, Knowledge, Wiki, watcher, or a deferred capability in this task.
- Each slice includes its focused tests/Fixtures and a scoped commit. Final status distinguishes local evidence from hosted CI and remote integration.

## Review Focus

- A migrated R008 graph has bindings but no R009 candidates: Task 1/3 tests demand `FULL_ANALYSIS_REQUIRED` with the graph unchanged, followed by successful full reanalysis.
- An upsert and explicit remove name the same Provider Fact: Task 2 rejects the entire patch; upsert alone supersedes the prior Evidence.
- A selected Provider support disappears while a second remains: Task 3 compares the new representative, candidate list, confidence, and binding set with pure FactMerger output.
- A node removal leaves an unchanged edge referencing it: Task 3 rejects and rolls back; no orphan edge or stale binding is silently discarded.
- A retry arrives after a committed target fingerprint: Task 3 fails its old-base check without applying twice; Task 4 preserves the last graph and reports fallback.

## File map

- `packages/storage/migrations/repository/009_active_support_candidates.sql` plus manifest: additive active-support candidate table; no prior migration edit.
- `packages/storage/src/analysis/canonical-fact-store.ts`: full-apply candidate write and one-transaction patch activation; `packages/storage/src/analysis/temp-stage.ts` retains full-analysis stage.
- `packages/storage/src/analysis/patch-stage.ts`: connection-local provisional patch rows and indexed iterators; a structural selection callback lets Storage reuse Provider's FactMerger without importing the Provider package.
- `packages/providers/src/native-client.ts` and `packages/providers/src/staged-patch.ts`: reuse v1 framing/checksum and canonical normalizers/FactMerger for a bounded refresh stream and changed support.
- `packages/application/src/apply-analysis-patch.ts`: opaque stage/store port and publication decision. `packages/runtime/src/patch-analysis.ts`: composition only, using deterministic synthetic v1 REFRESH in this task.
- Tests/Fixtures: `fixtures/storage/incremental-patch-apply/cases.json`, focused storage/provider/application/runtime tests, root `package.json` test inventory, and the named handoff authorities.

---

### Task 1: Governed R009 and full-analysis candidate persistence

**Files:** Create `packages/storage/migrations/repository/009_active_support_candidates.sql`, `packages/storage/test/active-support-candidates.test.mjs`; modify `packages/storage/migrations/repository/manifest.json`, `packages/storage/src/analysis/canonical-fact-store.ts`, `packages/storage/test/canonical-fact-store.test.mjs`, `packages/storage/test/repository-schema.test.mjs`, `fixtures/storage/repository-activation/cases.json`, root `package.json`, and the authority documents listed below.

**Interfaces:** `RepositoryCanonicalFactStore.applyAnalysisBatch(stage: RepositoryAnalysisStage, expected: ExpectedAnalysis): number` remains public and writes one candidate row for each staged active `MergeSupport`. The new table's key is `evidence_id`; `(evidence_id, fact_type, canonical_fact_id)` references `provider_fact_bindings` and `candidate_json` stores one schema-validated `CanonicalNode` or `CanonicalEdge`.

- [ ] **Step 1: Synchronize approved design authority.** Update `docs/handoff/specs/SQLITE_SCHEMA.md`, `ROADMAP.md`, `WORK_BREAKDOWN.md`, `PHASE_ACCEPTANCE.md`, `DESIGN_TRACEABILITY.md`, and `EVALUATION.md` with R009, legacy fallback, P05-W1-011 Fixture/check ownership, and the unpublished Phase 1 R010/R011 names. Keep current Phase 0.5 exit gates and Deferred scope unchanged.
- [ ] **Step 2: Write failing migration/full-apply tests.** In `active-support-candidates.test.mjs`, assert fresh R009 table/foreign key/JSON constraint, R008→R009 leaves old graph and bindings intact but candidates empty, and R001–R008 checksums stay identical. In `canonical-fact-store.test.mjs`, stage two supports for one fact and assert two distinct candidate rows equal their original normalized Canonical payloads, including the nonselected support; a same-WORKTREE full replacement removes retired candidates without deleting historical Evidence.
- [ ] **Step 3: Observe RED.** Build storage if needed, then run `node --test packages/storage/test/active-support-candidates.test.mjs packages/storage/test/canonical-fact-store.test.mjs`; expect missing R009/table/candidate assertions to fail.
- [ ] **Step 4: Implement R009 and candidate writes.** Add the migration/manifest checksum, read each staged support through the existing indexed TEMP groups, insert after bindings, validate with IR schemas, and retain one full-apply transaction. Do not edit old SQL or invent candidates during migration.
- [ ] **Step 5: Verify and commit.** Build Storage; rerun Step 3 plus `node --test packages/storage/test/repository-schema.test.mjs packages/storage/test/analysis-activation-state.test.mjs`; run architecture and whitespace checks. Commit only this slice as `feat(storage): persist active support candidates`.

### Task 2: Bounded validated patch staging

**Files:** Create `packages/storage/src/analysis/patch-stage.ts`, `packages/storage/test/patch-stage.test.mjs`, `packages/providers/src/staged-patch.ts`, `packages/providers/test/staged-patch.test.mjs`; modify `packages/providers/src/native-client.ts`, package exports, and root `package.json` test inventory.

**Interfaces:** `RepositoryPatchStage` owns TEMP rows and exposes `accept(event: unknown): Promise<void>`, `confirmSucceeded(terminal: unknown): void`, ordered changed-source/upsert/remove/coverage/diagnostic iterators, indexed Provider Fact lookups, `selectGroup(group: readonly PatchSupport[]): CanonicalNode | CanonicalEdge`, and `close(): void`. Its constructor accepts the structural `selectGroup` callback from Runtime; `PatchSupport` carries the same Canonical/Evidence/Binding/snapshot/input-path fields consumed by the existing Provider selector, without a Storage→Providers import. Providers export `streamNativeRefresh(request: Extract<NativeRequestEnvelope, { type: 'REFRESH' }>, options: NativeClientOptions, sink: NativeAnalysisSink): Promise<StreamedNativeAnalysisResult>` and `normalizeStagedPatch(stage, request, snapshot): void`; both reuse existing byte framing and P05-W4-001/002 selectors rather than a second policy.

- [ ] **Step 1: Write failing transport/stage tests.** Verify slow-sink backpressure, exact checksum/count/context/sequence and post-terminal rejection against synthetic v1 REFRESH JSONL; `PARTIAL` is transport-valid but not applicable. In TEMP stage, assert add/modify/delete event order independence, duplicate/missing remove, duplicate upsert, simultaneous remove/upsert of one Provider Fact, wrong snapshot/revision/source, and successful zero-event patch. Confirm `close()` drops only TEMP state.
- [ ] **Step 2: Observe RED.** Run `node --test packages/providers/test/staged-patch.test.mjs packages/storage/test/patch-stage.test.mjs`; expect absent APIs to fail.
- [ ] **Step 3: Implement shared bounded framing and provisional stage.** Reuse `readFramedEvents`, existing v1 event schemas, exact preterminal checksum, hard ceilings, and await the sink before reading more. Stage strict IR records with indexed TEMP lookups; normalize upserts only after a successful terminal, leaving removals as typed Provider refs. Reject duplicates/contradictions before persistent writes.
- [ ] **Step 4: Verify and commit.** Build Providers/Storage; rerun Step 2 and existing `native-client`, `native-ipc`, `native-ipc-bytes`, and `native-analysis-stream` suites. Commit `feat: stage validated provider patches`.

### Task 3: Atomic support reconciliation and patch activation

**Files:** Modify `packages/storage/src/analysis/canonical-fact-store.ts`, `packages/storage/test/canonical-fact-store.test.mjs`; create `packages/storage/test/analysis-patch-store.test.mjs`; register `fixtures/storage/incremental-patch-apply/cases.json` with task ID P05-W1-011, governing spec, exact case names, and acceptance text.

**Interfaces:** `RepositoryCanonicalFactStore.applyAnalysisPatch(stage: RepositoryPatchStage, expected: ExpectedPatch): number`, where `ExpectedPatch` has `repositoryId`, `baseRevisionId`, `baseContentFingerprint`, `targetRevisionId`, `targetContentFingerprint`, and `snapshot: ProviderSnapshot`. It reports lock duration; controlled failures distinguish `INVALID_PATCH`, `BASE_REVISION_MISMATCH`, and `FULL_ANALYSIS_REQUIRED` without raw payloads.

- [ ] **Step 1: Write failing transaction/Fixture tests.** Start from a committed graph, then assert exact node/edge add/modify/delete and same-WORKTREE target fingerprint activation. Use `two-provider-same-call` goldens for selected-support removal, retained second support, last-support deletion, and original confidence/candidate reselection. Assert explicit remove makes old Evidence `INVALIDATED`; replacement upsert makes it `SUPERSEDED`. Compare candidate/binding/Evidence/graph/pointer images after injected failures, missing candidate, stale base, changed target source, retry, dangling node/edge/candidate, and a zero-event success; reopen SQLite for each rollback check.
- [ ] **Step 2: Observe RED.** Build Storage, then run `node --test packages/storage/test/analysis-patch-store.test.mjs`; expect absent `applyAnalysisPatch` or new assertions to fail.
- [ ] **Amendment regression:** changed-revision ID and immutable target each return `FULL_ANALYSIS_REQUIRED` before mutation. Reopen SQLite and compare exact graph, support, Evidence, and activation image. Same-WORKTREE-ID target fingerprint change remains a success case.
- [ ] **Step 3: Implement the one-transaction store operation.** Under `BEGIN IMMEDIATE`, recheck base ID+fingerprint, target persisted fingerprint, new snapshot ID, and complete active candidate/support coverage. Retire affected support, insert new support/snapshot, reselect indexed affected FactKey groups through `stage.selectGroup` (the injected existing Provider selector), mutate edges/nodes in FK-safe order, validate all active bindings/facts and graph references, then update both activation fields last. Roll back every change on error; do not import Providers into Storage, scan/load the whole graph into a JS array, or commit per fact.
- [ ] **Step 4: Verify and commit.** Rerun Step 2, full-analysis store, migration, FactMerger, and architecture suites; compare exact Fixture goldens. Commit `feat(storage): apply validated graph patches atomically`.
- [ ] **Amendment guard:** under the same transaction reject base/target ID mismatch or target kind other than `WORKTREE` before retiring any support, with controlled full-analysis fallback.

### Task 4: Application composition and Phase 0.5 task evidence

**Files:** Create `packages/application/src/apply-analysis-patch.ts`, `packages/application/test/apply-analysis-patch.test.mjs`, `packages/runtime/src/patch-analysis.ts`, `packages/runtime/test/patch-analysis-composition.test.mjs`; modify package exports, root `package.json` test inventory, `docs/handoff/CURRENT_STATUS.md`, and `docs/handoff/DESIGN_TRACEABILITY.md` as needed for fresh evidence.

**Interfaces:** `applyAnalysisPatch<TStage>(input: PatchAnalysisInput, ports: { observeAndStage(input): Promise<{ outcome: 'SUCCEEDED' | 'PARTIAL'; snapshot: ProviderSnapshot; stage: TStage }>; factStore: { applyAnalysisPatch(stage: TStage, expected: ExpectedPatch): number } }): Promise<void>`; `PatchAnalysisInput` has repository, base ID/fingerprint, and target ID/fingerprint. Runtime's `applyNativePatchAnalysis(db, request, options, descriptor)` composes the v1 refresh stream, TEMP stage, normalizer, Application command, and store; it does not implement the Rust producer.

- [ ] **Step 1: Write failing command/composition tests.** Assert one store call only for matching successful snapshot and complete stage; zero calls for `PARTIAL`, failed/cancelled/corrupt stream, source/base mismatch, or normalization failure. Use a synthetic v1 REFRESH child with exact checksum through Runtime into a migrated temporary DB, assert graph/support/coverage/freshness, then inject a store failure and prove the previous graph remains. Keep Native real-binary `ANALYZE` and full apply regressions passing.
- [ ] **Step 2: Observe RED.** Run `node --test packages/application/test/apply-analysis-patch.test.mjs packages/runtime/test/patch-analysis-composition.test.mjs`; expect absent APIs to fail.
- [ ] **Step 3: Implement thin Application/Runtime wiring.** Application checks eligibility and context without Provider/Storage imports; Runtime supplies Provider's `selectMergedGroup` as the patch stage's structural callback, owns the connection/TEMP lifecycle, and closes staging in `finally`. No code path sends an unvalidated provisional event to persistent SQLite.
- [ ] **Step 4: Run declared gates.** Run all 16 TypeScript project builds and IR type tests; root Node fileset, registered P05-W1-011 Fixture, Native IPC v1 byte/stream regressions, real-binary full-analysis regressions, 17-project architecture check, Prettier, Rust fmt/Clippy/tests, and `pnpm verify` where dependency preflight permits. Record any blocked wrapper separately; do not claim hosted CI or Phase 0.5 exit from local checks.
- [ ] **Step 5: Update status and commit.** Record task ID, commit, commands, pass counts, Fixture, failure/recovery outcomes, R009, known limits, and P05-W3-020 as the next dependency. Synchronize traceability and acceptance wording without weakening gates. Commit `feat(application): coordinate validated patch apply`. Review the branch, then create/attach a PR and observe hosted checks only if the user selects that integration route.

## Plan review gate

Before execution, compare every test and interface above with the accepted spec and the current source. If R009 candidate persistence, existing FactMerger semantics, or one-transaction rollback cannot be preserved, stop for governed design review; do not substitute a full reparse, invent a numerical threshold, or silently alter a FROZEN contract.
