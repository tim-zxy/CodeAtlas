# P05-W3-003 Coverage and Outcomes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver exact Java per-file/capability coverage and resolution statistics with distinct analysis outcomes over negotiated Native IPC v2 while retaining strict v1.

**Architecture:** Keep v1 schemas and streams valid. Add a version-specific TypeScript request/stream validator and client path, collect site dispositions in the Java adapter's emitting pass, and emit v2 `COVERAGE` statistics through the existing bounded Rust coordinator. A pure TypeScript summary exposes limitations only after complete-stream validation; no Canonical or SQLite writer is added.

**Tech Stack:** Rust, Tree-sitter Java, serde_json, TypeScript, Zod, Node test runner, JSONL Fixture registry.

**Spec:** `docs/superpowers/specs/2026-09-28-p05-w3-003-coverage-outcomes-design.md`; accepted `docs/handoff/adr/ADR-015-native-ipc-v2-coverage-statistics.md`.

## Global Constraints

- Phase 0.5 P05-W3-003 only; no `REFRESH`, Canonical normalization, SQLite activation, queries/CLI, framework or Knowledge behavior.
- Keep strict IPC v1 and IR schema v1; v1 `DESCRIBE` advertises `[1, 2]`, while only `ANALYZE` may use protocol 2.
- Preserve the existing 1,000,000-byte line, 10,000-event, and 10,000,000-byte stdout ceilings and request budget; no new numeric Quality Gate.
- `eligibleSites = coveredSites + unsupportedSites + partialSites`; for relation capabilities, all five resolution counts sum to `coveredSites`.
- A source-grounded unresolved/ambiguous/unsupported-target edge is covered extraction, not resolved truth; unknown syntax-error regions are not invented sites.
- v1 numeric statistics are unavailable, not zero; no failed or corrupt stream exposes an applicable result.
- Run source/IPC/Native Fixtures, all relevant project tests, architecture checks, and hosted clean-install CI before claiming task completion.

## Review Focus

1. A v2 `COVERAGE` payload inside a v1 envelope must fail strict v1 validation (Task 1 test).
2. A synthetic compilation-unit/package-container node must not inflate `SYMBOL` or `IMPORT` site counts (Task 2 and Task 4 tests).
3. A valid Java file with zero source facts must have zero measured counts and `SUCCEEDED`, unlike unavailable v1 statistics (Task 3 and Task 4 tests).
4. A malformed Java region must produce `PARTIAL` without fabricating an eligible-site denominator for unrecognized syntax (Task 2 and Task 4 tests).
5. A started v2 stream that later hits timeout, parser failure, or an output ceiling must expose no coverage summary or applicable facts (Task 3 and Task 4 tests).

## File map and dependency order

1. `packages/providers/src/native-ipc-v2.ts` owns only v2 `ANALYZE` schemas and cross-field/complete-stream validation; `native-ipc.ts` remains the v1 contract and exports shared v1 payload schemas where needed. `native-client.ts` dispatches parsing/validation by request version, without a second process path.
2. `crates/native-analyzer/src/language.rs`, `java.rs`, and `java_relations.rs` own source-site accounting; the first declaration-index pass does not contribute to emitted counts.
3. `crates/native-analyzer/src/protocol.rs` owns v1 bootstrap/version dispatch; `analyze.rs` owns v2 event emission and the existing bounded failure path.
4. `packages/providers/src/coverage-summary.ts` owns a pure read-only summary. Native Fixture manifests/goldens and tests own Evaluation evidence; no production graph-query package changes.

Tasks 1 and 2 have independent internals but Task 3 consumes both contracts. Task 4 consumes Task 3's real-binary stream. Do not parallel-edit shared Native IPC/client files.

### Task 1: Strict TypeScript v2 contract and client path

**Files:** Create `packages/providers/src/native-ipc-v2.ts`; modify `packages/providers/src/native-ipc.ts`, `native-client.ts`, `index.ts`; create `packages/providers/test/native-ipc-v2.test.mjs`; modify `packages/providers/test/native-client.test.mjs` and root `package.json` test list.

**Interfaces:** Produce `NativeAnalyzeRequestV2Schema`, `NativeCoverageStatisticsV2Schema`, `NativeAnalyzeEventStreamV2Schema`, and schema-inferred `NativeAnalyzeRequestV2`/`NativeCoverageStatisticsV2` types in `native-ipc-v2.ts`. Extend `executeNativeRequest` to accept the existing `NativeRequestEnvelope` or `NativeAnalyzeRequestV2`, returning a discriminated validated result whose request and events retain their exact protocol version. Keep existing v1 exports and v1 callers valid.

- [ ] **Step 1: Write failing schema tests.** Assert a v2 `ANALYZE` request with IR schema 1 and the exact `statistics` shape parses; a v2 `REFRESH`, v2 `DESCRIBE`, extra/missing statistic field, unsafe/non-integer count, partition mismatch, resolution-sum mismatch, duplicate or missing file/capability coverage, and v2 payload in a v1 event fail. Use a complete minimal request and stream in `native-ipc-v2.test.mjs`; assert issue paths for malformed statistics.
- [ ] **Step 2: Verify RED.** Run `node --test packages/providers/test/native-ipc-v2.test.mjs`; expect missing export/schema failures, not a skipped test.
- [ ] **Step 3: Implement v2 schemas.** Reuse the v1 Provider facts, context, terminal, error, and budget shapes; only the v2 `ANALYZE` `COVERAGE` shape gains `statistics`. Validate one record for each requested file/capability and equations without Java-specific fact-kind inference. Reject all v2 request types except `ANALYZE`; v1 strict schema remains unchanged.
- [ ] **Step 4: Write failing client tests.** Use the existing deterministic child process Fixture to assert successful v2 checksum/terminal validation, v1 compatibility, version mismatch, and corruption/no-partial-result behavior. Assert returned v2 event types remain distinguishable from v1.
- [ ] **Step 5: Verify RED, implement client dispatch, then verify GREEN.** Run `node --test packages/providers/test/native-client.test.mjs packages/providers/test/native-ipc-v2.test.mjs`; dispatch envelope and line parsing by validated request protocol version and retain existing hard limits and stderr separation. Expect all tests to pass.
- [ ] **Step 6: Type/build and commit.** Run `./node_modules/.bin/tsc.cmd -p packages/providers/tsconfig.json` and `node --test packages/providers/test/native-ipc.test.mjs packages/providers/test/native-client.test.mjs packages/providers/test/native-ipc-v2.test.mjs`; commit only Task 1 paths as `feat(native): validate IPC v2 coverage streams`.

### Task 2: Java syntax-site accounting

**Files:** Modify `crates/native-analyzer/src/language.rs`, `java.rs`, `java_relations.rs`; modify `crates/native-analyzer/tests/java_symbols.rs`, `java_relations.rs`.

**Interfaces:** Add `SiteStatistics { eligible_sites, covered_sites, unsupported_sites, partial_sites, resolution_counts }` and a per-capability map to `LanguageAnalysis`; add a deterministic `ResolutionCounts` value with exact `EXACT`, `HEURISTIC`, `AMBIGUOUS`, `UNRESOLVED`, `UNSUPPORTED` buckets. The Java adapter records syntax dispositions, while `analyze.rs` later adds post-resolution buckets during emission. The public `LanguageAnalyzer::analyze` trait still returns `LanguageAnalysis`.

- [ ] **Step 1: Write failing Rust tests.** Assert one site per declared source-backed symbol or requested relation occurrence; multiple declarators count separately; synthetic nodes count zero; a source-less relation context increments the matching capability's unsupported count; malformed recognized syntax increments partial while unknown syntax is not counted. Assert valid empty Java is measured zero/complete. Task 3 proves the coordinator uses only second-pass counts.
- [ ] **Step 2: Verify RED.** Run `cargo test -p codeatlas-native-analyzer --test java_symbols --test java_relations -j 1`; expect new accounting assertions to fail.
- [ ] **Step 3: Implement minimal accounting.** Record site disposition where the Java visitor/collector already accepts or declines syntax; keep one disposition per recognized site. Add no AST retention, unbounded side list, new parser flag, or speculative framework classification. Preserve source-range diagnostics and existing Provider Fact IDs.
- [ ] **Step 4: Verify GREEN and existing extraction.** Rerun the two Rust test files and `cargo test -p codeatlas-native-analyzer --test analyze -j 1`; assert unchanged v1 fact and coverage goldens. Commit Task 2 files as `feat(native): account for Java syntax coverage sites`.

### Task 3: Rust v2 handshake, emission, and distinct outcomes

**Files:** Modify `crates/native-analyzer/src/protocol.rs`, `analyze.rs`; modify `crates/native-analyzer/tests/handshake.rs`, `analyze.rs`, `packages/providers/test/native-handshake.test.mjs`; add focused Rust v2 test file `crates/native-analyzer/tests/coverage_v2.rs`. Keep `fixtures/ipc/handshake-v1/cases.json` unchanged: it pins request framing and outcome, while the Rust handshake test pins the descriptor's version list.

**Interfaces:** `protocol::serve_once` keeps protocol-v1 `DESCRIBE` bootstrap and advertises `[1,2]`; `analyze::run` validates the request's selected protocol version and emits matching envelopes. For v2, emit the Task 2 `SiteStatistics` in every requested file/capability `COVERAGE`; classify resolution buckets from emitted honest edge targets. v1 `ANALYZE` event payloads remain byte-compatible; the `DESCRIBE` descriptor's supported-version list deliberately changes.

- [ ] **Step 1: Write failing version tests.** Assert v1 `DESCRIBE` advertises `[1,2]` with IR `[1]`; v1 `ANALYZE` remains unchanged; v2 `ANALYZE` emits only protocol-2 envelopes with exact per-file/capability statistics; v2 `REFRESH` fails explicitly. Assert unsupported version and failure-terminal envelope version are correct.
- [ ] **Step 2: Verify RED.** Run `cargo test -p codeatlas-native-analyzer --test handshake --test coverage_v2 -j 1`; expect the new v2 cases to fail.
- [ ] **Step 3: Implement minimal version dispatch and emission.** Include statistics in the second-pass result only, exclude synthetic nodes, count an emitted non-resolved edge as covered and in its target-resolution bucket, and preserve ordered bounded batches, checksum, event/byte ceilings, stdout-only JSONL, and stderr-only logs.
- [ ] **Step 4: Write outcome/failure tests.** In `coverage_v2.rs`, assert `SUCCEEDED`/zero facts versus `PARTIAL`/syntax error, distinct `BUDGET_EXCEEDED`, `RESOURCE_LIMIT_EXCEEDED`, `UNSUPPORTED_LANGUAGE`, `UNSUPPORTED_CAPABILITY`, and `INTERNAL_ANALYZER_FAILURE` terminals. Use a test-only injected processing failure seam for parser exception/panic, not a production CLI or IPC fault knob. Assert a failed terminal is not followed by completion and no partial result is applicable.
- [ ] **Step 5: Verify GREEN and v1 regression.** Run `cargo test -p codeatlas-native-analyzer -j 1`, `cargo fmt --all --check`, and `node --test packages/providers/test/native-handshake.test.mjs packages/providers/test/native-analysis.test.mjs packages/providers/test/native-relations.test.mjs` after `cargo build --workspace -j 1`; all must pass. Commit Task 3 paths as `feat(native): emit versioned coverage and distinct outcomes`.

### Task 4: Registered real-binary Fixtures, summary, and acceptance evidence

**Files:** Create `packages/providers/src/coverage-summary.ts`, `packages/providers/test/coverage-summary.test.mjs`, `packages/providers/test/native-coverage-v2.test.mjs`; modify `packages/providers/src/index.ts`; add registered `fixtures/native/java-coverage-*` manifests with pinned `source/` and exact `expected/` node/edge/coverage/diagnostic files; add `fixtures/ipc/protocol-v2/cases.json` and pinned valid/invalid JSONL; modify `packages/providers/test/native-ipc-bytes.test.mjs`, `crates/native-analyzer/tests/protocol_fixtures.rs`, root `package.json`, and `.gitattributes`; update handoff specs/status/traceability only with observed results.

**Interfaces:** Export `summarizeNativeCoverage(result: ValidatedNativeResult): NativeCoverageSummary` from `coverage-summary.ts`. The summary is `{ statisticsAvailable: boolean; files: readonly { sourceFileId: string; capability: string; support: string; coverage: string; statistics: NativeCoverageStatisticsV2 | null }[]; warnings: readonly { code: 'STATISTICS_UNAVAILABLE' | 'PARTIAL_COVERAGE' | 'UNSUPPORTED_SITE' | 'INCOMPLETE_RESOLUTION'; sourceFileId: string | null; capability: string | null }[] }`. Sort files by source-file ID then capability, warnings by code/file/capability; emit `STATISTICS_UNAVAILABLE` once for a v1 response. It rejects a failed/corrupt/non-`ANALYZE` result; it performs no I/O and never updates Knowledge or Canonical state.

- [ ] **Step 1: Write failing summary tests.** Assert v1 means unavailable rather than measured zero; v2 valid empty file means measured zero; partial syntax, unsupported recognized sites, ambiguous/unresolved targets, and a v2 failed result produce the exact expected warning/error behavior. Run `node --test packages/providers/test/coverage-summary.test.mjs` and observe RED.
- [ ] **Step 2: Implement pure summary and verify GREEN.** Read only the fully validated result; do not parse stderr or infer unknown sites from missing facts. Rerun the summary test and type-check providers.
- [ ] **Step 3: Add registered source Fixtures and real-binary test RED.** Pin mixed resolution, unsupported relation source, syntax-partial, zero-fact, and synthetic-node cases. Assert exact Provider Facts, per-file/capability statistics, diagnostics, terminal, checksum, and 1-/2-worker identical normalized statistics. Assert timeout/parser/resource failures expose no result. Add summary's unit test to root `test` and the real-binary test to `test:native-analysis`, which runs after `cargo build`. Run `node --test packages/providers/test/native-coverage-v2.test.mjs`; observe RED before final Fixture/producer adjustments.
- [ ] **Step 4: Add shared v2 byte cases and cross-language checks.** The v2 corpus covers valid stream and version mismatch, duplicate/missing coverage, malformed/overflow counts, partition/resolution mismatch, checksum/count mismatch, and post-terminal bytes; pin raw bytes in `.gitattributes`. Run `node --test packages/providers/test/native-ipc-bytes.test.mjs packages/providers/test/native-coverage-v2.test.mjs` and `cargo test -p codeatlas-native-analyzer --test protocol_fixtures -j 1`; expect GREEN after source-of-truth fixes, never baseline rewriting solely to pass.
- [ ] **Step 5: Run all declared gates and record evidence.** Run all 16 TypeScript builds plus IR type tests, the root declared Node fileset, Native real-binary suites, `cargo fmt --all --check`, `cargo build --workspace -j 1`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace -j 1`, architecture check, Prettier, and whitespace check. Attempt `pnpm verify`; if desktop dependency preflight blocks it, report the exact failure and direct constituent checks without relabeling them. Update `CURRENT_STATUS.md` and `DESIGN_TRACEABILITY.md` with exact Fixture IDs, commands, pass counts, schema impact, limitations, and next task. Commit Task 4 artifacts as `test(native): pin v2 coverage and outcome evidence`.
- [ ] **Step 6: Review and hosted integration.** Obtain a whole-branch code review, repair findings with RED→GREEN tests, rerun affected and full checks, then create a PR only after the user chooses that integration option. Hosted clean-install CI and exact merge evidence remain prerequisites to claiming integration; this plan does not authorize merging the PR.

## Self-review checklist before execution

- [x] Each accepted spec/ADR requirement maps to Tasks 1–4; v1 compatibility and no v2 `REFRESH` are explicit.
- [x] Every Review Focus item has a failing-first test in its owning task.
- [x] Interfaces, names, count equations, version handling, and fixture paths are consistent across tasks.
- [x] No task introduces a deferred feature, numeric threshold, SQLite write, or query implementation.
