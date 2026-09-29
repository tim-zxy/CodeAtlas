# P05-W1-010 Full Analysis Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a complete, validated Native full-analysis graph atomically, with bounded staging and an honest durable freshness marker.

**Architecture:** Runtime composes the Native stream, temporary SQLite stage, Application command, and storage-backed `CanonicalFactStore`; Application owns the decision to activate, while Storage owns SQL and Providers own IPC/normalization/merge rules. Only a `SUCCEEDED` stream reaches one `BEGIN IMMEDIATE` activation transaction. The indexed revision ID and fingerprint commit together; errors retain the prior graph.

**Tech Stack:** Node 24, TypeScript 7, `node:sqlite`, existing Rust/Tree-sitter Native binary, JSONL IPC v1/v2, Node test runner, existing Fixture/Evaluation packages.

**Spec:** `docs/superpowers/specs/2026-09-29-p05-w1-010-full-analysis-apply-design.md`

## Global Constraints

- Do not edit published R001–R007 SQL/checksums; add R008 `indexed_fingerprint`, shift only unpublished Phase 1 repository migration reservations to R009/R010.
- Preserve protocol v1/v2 shapes and ceilings (1,000,000-byte line, 10,000,000-byte stdout, 10,000 events), Canonical IR, FactMerger selection, and the Rust/SQLite boundary.
- Only `SUCCEEDED` full `ANALYZE` activates. `PARTIAL`, failed, cancelled, invalid, or changed-source results never replace the graph.
- No `REFRESH`/patch, graph query/CLI, Knowledge, Wiki, Agent, adaptive scheduling, new dependency, or unsupported numerical performance threshold.
- Read `AGENTS.md` and the handoff authorities in their required order before the first implementation edit. Make every task's changed contract, Fixture, and documentation agree before its commit.

## Review Focus

- Legacy database with `indexed_revision_id` but no fingerprint: Task 1 proves `UNKNOWN`, never `CURRENT`.
- Valid terminal `PARTIAL` result: Task 2 accepts transport; Task 5 refuses activation and retains the previous graph.
- Same mutable `WORKTREE` ID, new fingerprint, failure after deleting old rows: Task 4 proves complete rollback, then Task 5 proves stale-versus-current reporting.
- Slow stage plus malformed post-terminal bytes or checksum: Task 2 proves backpressure cannot expose an applicable result.
- Duplicate support or dangling source/target/binding across stage pages: Task 3 and Task 4 reject the entire run, including zero stale active bindings.

## File map

- `packages/storage/migrations/repository/008_indexed_fingerprint.sql` and its manifest: additive activation-fingerprint migration only.
- `packages/storage/src/analysis/`: connection-local temporary stage, active-state reader, FK-safe single-transaction apply; export from `packages/storage/src/index.ts`. No Provider package import.
- `packages/providers/src/native-client.ts` plus a focused stream validator module: async event delivery with the current byte-level checks; existing buffered API stays compatible.
- `packages/providers/src/canonical-normalizer.ts` and `fact-merger-*`: factor existing mapping/selection into bounded stage-page operations, preserving the old public pure APIs and their Fixtures.
- `packages/application/src/apply-full-analysis.ts`: port-defined command; no Provider or Storage imports. `packages/runtime/src/` wires Provider and Storage ports without moving application decisions into Runtime.
- Existing tests and registered Fixtures: focused storage/provider/application/runtime tests, root test inventory, `docs/handoff/` authorities, and status evidence.

---

### Task 1: Governed R008 migration and freshness state

**Files:** Create `packages/storage/migrations/repository/008_indexed_fingerprint.sql`, `packages/storage/src/analysis/activation-state.ts`, `packages/storage/test/analysis-activation-state.test.mjs`; modify repository manifest, `packages/storage/test/repository-schema.test.mjs`, `fixtures/storage/repository-schema/cases.json`, `docs/handoff/specs/SQLITE_SCHEMA.md`, `docs/handoff/ROADMAP.md`, `docs/handoff/PHASE_ACCEPTANCE.md`, `docs/handoff/DESIGN_TRACEABILITY.md`, and storage exports. Keep the original P0 seven-migration assertions as a prefix; extend latest-version assertions to eight.

**Interfaces:** `readAnalysisFreshness(db: DatabaseSync, repositoryId: EntityId): 'NOT_INDEXED' | 'UNKNOWN' | 'STALE' | 'CURRENT'`; `readActiveAnalysisState(db, repositoryId)` returns both nullable activation values without inferring a fingerprint from historical facts. Task 4 owns all writes to these columns.

- [ ] **Step 1: Synchronize the authority documents.** Insert R008 activation fingerprint and move only the unpublished Phase 1 reservations to R009/R010 in the named handoff files; retain Phase 0's published R001–R007 record.
- [ ] **Step 2: Write failing migration/freshness tests.** Assert fresh R008 DB has both fields null; an R007 DB with a non-null legacy pointer upgrades without changing the pointer/graph and reads `UNKNOWN`; a changed `WORKTREE` fingerprint reads `STALE`; matching ID+fingerprint reads `CURRENT`; malformed/new half-state is never `CURRENT`. Verify R001–R007 names/checksums and upgrade boundaries remain pinned.
- [ ] **Step 3: Run the focused tests and observe RED.** `node --test packages/storage/test/repository-schema.test.mjs packages/storage/test/analysis-activation-state.test.mjs` after storage build; expect missing R008/reader assertions to fail.
- [ ] **Step 4: Implement only the additive migration, manifest checksum, and read-only freshness helper.** Use `ALTER TABLE repository_state ADD COLUMN indexed_content_fingerprint TEXT`, `backupRequired: false`, no backfill, and no down migration.
- [ ] **Step 5: Build and rerun focused tests; expect all PASS.** `pnpm --filter @codeatlas/storage build` then the Step 3 command. Run `node scripts/check-architecture.mjs` and `git diff --check`.
- [ ] **Step 6: Commit migration, tests, and authority updates together.** Stage only the files in this task; commit `feat(storage): track indexed fingerprint`.

### Task 2: Bounded Native full-analysis event delivery

**Files:** Modify `packages/providers/src/native-client.ts`, `packages/providers/src/index.ts`; create `packages/providers/src/native-analysis-stream.ts` and `packages/providers/test/native-analysis-stream.test.mjs`; update the root `package.json` test-file list. Reuse the existing test child and protocol-v1/v2 byte Fixtures.

**Interfaces:** Export `streamNativeAnalysis(request: NativeRequestEnvelope | NativeAnalyzeRequestV2, options: NativeClientOptions, sink: { accept(event: NativeEventEnvelope | NativeAnalyzeEventEnvelopeV2): Promise<void> }): Promise<{ terminal: NativeEventEnvelope | NativeAnalyzeEventEnvelopeV2; stderr: string }>`; require `request.type === 'ANALYZE'`. Calls to `accept` are provisional until the promise resolves and the caller has inspected the terminal outcome. Existing `executeNativeRequest` signature/behavior is unchanged.

- [ ] **Step 1: Write failing stream tests.** Compare buffered and streamed v1/v2 terminal/count/checksum acceptance; delay `accept` and assert upstream stdout does not outrun one pending event; inject bad checksum, extra bytes after terminal, missing terminal, malformed/count/sequence drift, byte/event limits, timeout/cancellation, and `PARTIAL` (transport-valid, not activated).
- [ ] **Step 2: Run focused tests and observe RED.** `node --test packages/providers/test/native-client.test.mjs packages/providers/test/native-analysis-stream.test.mjs` after providers build; expect the new stream API tests to fail before implementation.
- [ ] **Step 3: Refactor the existing decoder into one shared framing/validation state machine.** Hash each exact pre-terminal record incrementally; await `sink.accept` before consuming more stdout; keep only the pending line/event and bounded stderr in memory. Do not reimplement v1/v2 validity with looser checks; compare against existing complete-stream validators on the pinned byte corpora.
- [ ] **Step 4: Build and rerun focused tests and both byte-Fixture suites; expect PASS.** `pnpm --filter @codeatlas/providers build` then `node --test packages/providers/test/native-client.test.mjs packages/providers/test/native-ipc-bytes.test.mjs packages/providers/test/native-ipc-v2.test.mjs packages/providers/test/native-analysis-stream.test.mjs`.
- [ ] **Step 5: Commit the transport slice.** `feat(providers): stream validated analysis events`.

### Task 3: TEMP stage and bounded normalization/merge

**Files:** Create `packages/storage/src/analysis/temp-stage.ts`, `packages/storage/test/analysis-temp-stage.test.mjs`, `packages/providers/src/staged-normalization.ts`, `packages/providers/test/staged-normalization.test.mjs`; make focused changes to `canonical-normalizer.ts`, `java-node-normalizer.ts`, `fact-merger-input.ts`, `fact-merger-selection.ts`, and exports only where reuse requires it. Register a P05 full-analysis-apply Fixture under `fixtures/storage/full-analysis-apply/`; add new test files to the root test inventory.

**Interfaces:** `RepositoryAnalysisStage` is constructed with one `DatabaseSync` connection and has `accept(event: unknown): Promise<void>`, `readSourceFiles()/readProviderNodes()/readProviderEdges()` as ordered bounded iterators, `getProviderNode(providerFactId)`, `putNormalizedNode(pair)`, `getNormalizedNode(providerFactId)`, `appendMergedRow(row: StagedMergedRow)`, `readMergedRows(kind)` as a bounded iterator, and `close(): void`. Define `StagedMergedRow` here as a discriminated union with `kind: 'NODE' | 'EDGE' | 'EVIDENCE' | 'FACT_EVIDENCE' | 'BINDING'` and the corresponding Canonical IR `value` type. Its implementation parses and stores validated JSON/IR records generically and imports no Provider types. `normalizeStagedAnalysis(stage)` and `mergeStagedAnalysis(stage, snapshot)` in Providers use those structural methods; no Provider implementation owns SQLite or bypasses Canonical IR.

- [ ] **Step 1: Write failing stage/equivalence tests.** Assert an event order with edges before node lookup, duplicate provider ID/support, missing source/target, ambiguous target, and zero-fact success; compare exact Canonical IDs, Evidence/Bindings, confidence and explanations to `canonical-normalization` and `two-provider-same-call` Fixtures. Assert slow consumer keeps JS pending rows bounded and that `close` drops TEMP tables without touching persistent graph rows.
- [ ] **Step 2: Run focused tests and observe RED.** `node --test packages/storage/test/analysis-temp-stage.test.mjs packages/providers/test/staged-normalization.test.mjs` after relevant builds; expect missing stage/normalizer assertions to fail.
- [ ] **Step 3: Implement the smallest indexed TEMP stage and shared per-fact normalizer/FactMerger selectors.** Iterate source files, nodes, edges, then same-FactKey support groups in stable order; use stage lookups rather than all-repository maps. Preserve the original buffered public functions by composing those same selectors. Fail on any duplicate/context/dangling validation error before activation.
- [ ] **Step 4: Build and run stage plus previous normalization/FactMerger Fixtures; expect PASS.** `pnpm --filter @codeatlas/providers build` and `pnpm --filter @codeatlas/storage build`, then `node --test packages/storage/test/analysis-temp-stage.test.mjs packages/providers/test/staged-normalization.test.mjs packages/providers/test/canonical-normalizer.test.mjs packages/providers/test/fact-merger.test.mjs`.
- [ ] **Step 5: Commit the bounded candidate stage.** `feat: stage and normalize full analysis in bounded pages`.

### Task 4: CanonicalFactStore atomic activation

**Files:** Create `packages/storage/src/analysis/canonical-fact-store.ts`, `packages/storage/test/canonical-fact-store.test.mjs`; update storage exports and root test inventory. Use the Task 3 stage and R001–R008 schema; do not introduce another persistent table.

**Interfaces:** `RepositoryCanonicalFactStore.applyAnalysisBatch(stage: RepositoryAnalysisStage, expected: { repositoryId: EntityId; revisionId: EntityId; contentFingerprint: ContentFingerprint; snapshot: ProviderSnapshot }): void`. The store accepts only a completely validated `SUCCEEDED` staged result; it owns `BEGIN IMMEDIATE`/commit/rollback and writes both activation fields last.

- [ ] **Step 1: Write failing activation/failure-injection tests.** Seed active graph A, including Evidence/Bindings, then apply graph B to the same `WORKTREE` ID/fingerprint change; assert replacement, correct FK rows, superseded Evidence, zero stale active bindings, and both activation fields. Inject faults before write, after old-row removal, during inserts, and before pointer update; reopen and compare A and both activation fields byte-for-byte. Also test empty B, different revision, duplicate/dangling staged references, `PRAGMA foreign_keys = ON`, and a changed source fingerprint under the write lock.
- [ ] **Step 2: Run focused tests and observe RED.** `node --test packages/storage/test/canonical-fact-store.test.mjs` after storage build; expect absent store or activation assertions to fail.
- [ ] **Step 3: Implement FK-safe prepared batched writes within one transaction.** Validate stage completion/snapshot/revision and referential consistency before destructive writes; supersede old Evidence and remove old bindings/links, replace same-revision graph rows in dependency order, write new facts and support/coverage/diagnostics, then update ID+fingerprint in one statement. Roll back on any thrown error; no per-fact commits or direct writer outside the store.
- [ ] **Step 4: Build and rerun focused storage suites; expect PASS.** `pnpm --filter @codeatlas/storage build` then `node --test packages/storage/test/canonical-fact-store.test.mjs packages/storage/test/source-state.test.mjs packages/storage/test/repository-schema.test.mjs`.
- [ ] **Step 5: Commit the activation slice.** `feat(storage): atomically activate full analysis`.

### Task 5: Application command, runtime composition, and acceptance evidence

**Files:** Create `packages/application/src/apply-full-analysis.ts`, `packages/application/test/apply-full-analysis.test.mjs`; update application exports. Add one focused composition module/test under `packages/runtime/src/` and `packages/runtime/test/`, runtime dependencies only if already allowed by the architecture map, root test inventory, registered Fixture expected outputs, `docs/handoff/specs/EVALUATION.md`, `docs/handoff/DESIGN_TRACEABILITY.md`, and `docs/handoff/CURRENT_STATUS.md`.

**Interfaces:** `applyFullAnalysis<TStage>(input: { repositoryId: EntityId; revisionId: EntityId; contentFingerprint: ContentFingerprint }, ports: { observeAndStage(input): Promise<{ outcome: 'SUCCEEDED' | 'PARTIAL'; snapshot: ProviderSnapshot; stage: TStage }>; factStore: { applyAnalysisBatch(stage: TStage, expected): void } }): Promise<void>`. Keep `TStage` opaque to Application; Runtime supplies the concrete Provider/Storage adapters. Do not make Application import Provider or Storage packages.

- [ ] **Step 1: Write failing command/composition tests.** Use ports to assert `SUCCEEDED` calls `applyAnalysisBatch` once; `PARTIAL`, cancellation, failed terminal, changed source, and staging exception call it zero times. Run the real Native Java Fixture through runtime wiring into a temporary migrated DB; assert persisted graph/support/coverage and `CURRENT` freshness. Reconcile a changed source fingerprint and assert retained graph is `STALE` until a successful new activation.
- [ ] **Step 2: Run focused tests and observe RED.** `node --test packages/application/test/apply-full-analysis.test.mjs packages/runtime/test/full-analysis-composition.test.mjs` after builds; expect missing command/wiring assertions to fail.
- [ ] **Step 3: Implement the thin command and composition.** Runtime creates one owned DB connection/stage, streams the Provider, normalizes/merges only `SUCCEEDED`, calls Application, and closes TEMP state in `finally`; Application decides activation but never sees Native event shapes or composes SQL. Construct the strict ProviderSnapshot from request/descriptor and observed timing without inventing source evidence.
- [ ] **Step 4: Run acceptance and architecture gates.** Build all TypeScript projects; run the root `pnpm test`, `node scripts/check-architecture.mjs`, declared Native analysis/real-binary Fixtures, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, and `cargo test --workspace`. Record Cold Index/scan-parse-resolve-IPC-normalize-DB-apply-total/peak-memory observations with pinned inputs; no new threshold. Run `pnpm verify` where dependency access permits, and report any blocked preflight distinctly from constituent passes.
- [ ] **Step 5: Update reproducible status/traceability and commit.** Record exact commands, results, Fixture IDs, failure injection, architecture check, measured baseline, and explicit remaining Phase 0.5 gates in `CURRENT_STATUS.md`; do not claim the phase exit or hosted CI before observing them. Commit `feat(application): coordinate full analysis apply`. After local review, create the PR, observe hosted checks, repair if needed, and attach the PR to this task.

## Plan review gate

Before execution, verify every named interface against the accepted spec and repository boundaries, especially the generic TEMP stage contract and strict v1/v2 stream equivalence. If a test reveals the approved design cannot preserve one-transaction rollback, bounded memory, or Provider-independent facts, stop for a governed design change; do not lower a gate or bypass the validated application path.
