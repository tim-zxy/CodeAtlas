# P05-W3-020-B State and Full Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate real Native v3 full-analysis summaries atomically with the existing graph, and read a bounded, validated baseline after restart.

**Architecture:** Reuse Provider schemas, Rust extraction/resolution, connection-local TEMP staging and the existing Store transaction. Runtime injects synchronous Provider validation into Storage; Storage remains IR-only. A separate explicit full-v3 composition leaves the public v1/v2 SPI and Application publication workflow unchanged.

**Tech Stack:** Node `>=24 <25`, TypeScript, Zod, `node:sqlite`, Rust edition 2024, existing Tree-sitter Java, SHA-256 and JSONL. Retain `pnpm@11.19.0`; add no dependency.

**Spec:** [Accepted packet B design](../specs/2026-10-01-p05-w3-020-state-bootstrap-design.md), approved by the user on 2026-10-01. The user subsequently approved this plan for native execution; implementation is in progress, not packet-complete.

## Global Constraints

- Read AGENTS/Handoff authorities and relevant ADR-014/015/016, specs and Fixture manifests before implementation; stop on a FROZEN conflict. Phase 0 stays closed and Phase 0.5 stays open, at 10/14 integrated roadmap tasks.
- Implement B1–B4 only. No real REFRESH producer, v3 patch activation, scheduler, new language/framework, query/CLI, Knowledge/Wiki or phase-wide incremental/performance claim.
- R010 is version `10`, name `native_analysis_state`, file `010_native_analysis_state.sql`, `backupRequired: false`. Compute the actual LF-normalized SQL checksum; never modify released R001–R009 SQL/checksums.
- Follow the spec's exact two-table schema, ordinary JSON, one active baseline per Provider, no `source_files` FK, no guessed backfill, no new Canonical IR or ProviderSnapshot field.
- Existing hard ceilings: stdin/line `1,000,000` bytes, stdout `10,000,000` bytes, events `10,000`, stderr `1,000,000` bytes. Derived serialized JSON cumulatively cannot exceed `1,000,000` bytes; caller/request limits only lower ceilings. Account decoded/digest allocations under the existing request budget; do not equate serialized size with RSS.
- Full-summary metadata counts separately; response checksum remains `sha256:<hex>` over exact pre-terminal LF bytes. Packet A state/request digests stay bare hex. Preserve its numeric/Unicode encoding and strict schemas.
- Only SUCCEEDED may activate. Graph, Evidence, bindings, R009 candidates, snapshot/coverage/diagnostics, summaries and indexed pointers share one Store commit/rollback. Source reconciliation never clears summaries; successful legacy full/patch does so in its existing transaction.
- Complete request validation precedes Rust parsing. Await every stdout sink acceptance; shell-free spawn, allowlisted environment, cancellation and timeout remain enforced.
- No v3 advertisement until the real producer/client/bootstrap gate passes. Then advertise protocol 3, explicitly reject v3 REFRESH, and advertise no incremental capability.
- Existing quality thresholds/goldens stay authoritative. New metadata expected values must be independently justified, not copied unquestioningly from the producer.
- The user accepted the written Node admission detail, amended plan and actual Windows reservation on 2026-10-01. Use the measured full-envelope reservation plus retained-SQL-string charge, not a JSON multiplier or Rust worker reservation. Unknown profile/environment or an uncalibrated path refuses admission; no OS hard-memory claim. Continue the approved native sequence; changed measured paths retain report review.

## Review Focus

1. Source reconciliation deletes/replaces inventory before Apply: older indexed summaries remain AVAILABLE while graph freshness is STALE (Task 2).
2. Concurrent activation has the same revision/fingerprint but a different snapshot/digest: reject the captured token, preserving the winning activation (Task 6).
3. One shared Java package node has multiple owners: emit it once, include every grounded owner, reject missing/mixed ownership (Tasks 3 and 5).
4. Slow sinks, oversize summaries and cancellation between header and completion: bound buffering and publish nothing (Task 4).
5. A legacy successful replacement has an unchanged fingerprint, or a late SQL error follows summary deletion: clear on success, retain the exact reopened state on failure (Task 6).

---

## File map and shared interfaces

New files below are planned, not existing or passing. Keep each task's docs/runner registration in that task's commit.

| Owner             | Files                                                                                                                                                                                                                                    | Responsibility                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Storage           | `packages/storage/migrations/repository/010_native_analysis_state.sql`, `manifest.json`; `packages/storage/src/analysis/native-analysis-state.ts`; existing `analysis/temp-stage.ts`, `analysis/canonical-fact-store.ts`, `src/index.ts` | Migration, structural read/stage port, sealed metadata, atomic lifecycle             |
| Providers         | `packages/providers/src/native-analysis-output-v3.ts`, `native-analysis-validation.ts`; existing `native-client.ts`, `src/index.ts`                                                                                                      | Strict full-output validation, correspondence/digest port, bounded process transport |
| Rust              | existing `crates/native-analyzer/src/{analyze,protocol,analysis_state,request_v3,lib}.rs`                                                                                                                                                | Full v3 dispatch and summaries from real extraction; no SQLite                       |
| Runtime           | `packages/runtime/src/native-analysis-validation.ts`, `native-full-bootstrap.ts`; existing `src/index.ts`                                                                                                                                | One validation adapter and explicit full bootstrap/read composition                  |
| Tests/Fixtures    | New files named in Tasks 1–7; existing full/patch/handshake suites                                                                                                                                                                       | Migration, malformed streams, real producer, rollback and compatibility evidence     |
| Authority/runners | Root and affected package `package.json`, `.gitattributes`, `.github/workflows/ci.yml`; existing Handoff/spec/trace/status documents                                                                                                     | Required execution and truthful lifecycle publication                                |

Storage's `analysis/native-analysis-state.ts` owns these interfaces; no Provider import:

```ts
type NativeActivationToken = Readonly<{
  indexedRevisionId: string | null;
  indexedContentFingerprint: string | null;
  states: readonly Readonly<{ providerId: string; snapshotId: string; summaryDigest: string }>[];
}>;
type NativeStateExpectation = Readonly<{
  repositoryId: string;
  providerId: string;
  providerVersion: string;
  revisionId: string;
  contentFingerprint: string;
  language: Readonly<{
    languageId: string;
    grammarVersion: string;
    analyzerVersion: string;
    compatibilityVersion: string;
  }>;
  resolverVersion: string;
  normalizerVersion: string;
  policyFingerprint: string;
  requestedCapabilities: readonly string[];
}>;
type NativeStateJsonFile = Readonly<{
  sourceFileId: string;
  sourcePath: string;
  contentFingerprint: string;
  summaryJson: string;
}>;
type ValidatedNativeState = Readonly<{
  expected: NativeStateExpectation;
  headerJson: string;
  summaryDigest: string;
  files: readonly NativeStateJsonFile[];
}>;
type NativeStateValidationInput = Readonly<{
  headerJson: string;
  files: Iterable<NativeStateJsonFile>;
  expected: NativeStateExpectation;
  maxSerializedBytes: number;
  memoryBudgetBytes: number;
  // Present only while sealing a full candidate; use the existing stage's read-only iterators.
  fullStage?: Pick<
    RepositoryAnalysisStage,
    | 'readSourceFiles'
    | 'readProviderNodes'
    | 'readProviderEdges'
    | 'readCoverage'
    | 'readDiagnostics'
  >;
}>;
type NativeStateValidationPort = (input: NativeStateValidationInput) => ValidatedNativeState;
type NativeBaselineResult =
  | Readonly<{ status: 'AVAILABLE'; state: ValidatedNativeState; token: NativeActivationToken }>
  | Readonly<{
      status: 'UNAVAILABLE';
      reason: 'MISSING' | 'INCOMPATIBLE' | 'INVALID' | 'RESOURCE_LIMIT_EXCEEDED' | 'NOT_APPLICABLE';
    }>;
```

The language fields above match the existing `NativeAnalyzerLanguageSchema`, including `compatibilityVersion`; do not move that Provider schema into IR. `requestedCapabilities` is validated against existing capabilities by the injected port, not a new Storage capability schema. Sort token states by Provider ID; compare exact snapshot/digest as well as indexed fields. Capture the digest from validated header fields, not an invented top-level database column. On a corrupt pre-existing header, refuse bootstrap/read safely rather than treating corruption as an empty token. Bound each row before accumulation and validate provenance in the same read transaction.

Provider owns `NativeFullAnalyzeRequestV3 = Extract<NativeRequestHeaderV3, {type:'ANALYZE'}>`, `NativeFullAnalysisEventV3` (the spec's exact union) and `NativeFullAnalysisTerminalV3` (its terminal subset). Runtime owns the function returned by `createNativeStateValidationPort(): NativeStateValidationPort`; it delegates schema/digest/correspondence checks to Providers, and never gives that callback database access. At restart, validate persisted schema/digest/context/provenance; do not pretend persisted Canonical representatives reconstruct the original Provider stream. Full-stage fact correspondence is proved before persistence.

Inspection found packet A test context values `resolverVersion: '1'` and `normalizerVersion: '1'`, but no production compatibility constants. Introduce native-owned `JAVA_RESOLVER_VERSION = "1"` and TypeScript-owned `JAVA_NORMALIZER_VERSION = '1'` for the current algorithms, not arbitrary echoed caller values. Any algorithm change requiring a bump follows ADR-016 invalidation. This is an implementation pin, not a new accuracy threshold.

## Task 1: Release the empty R010 schema safely (B1)

**Files:** Create the R010 SQL and `fixtures/storage/native-analysis-state/cases.json` (`p05-native-analysis-state-store-v1`); modify repository manifest, `packages/storage/test/migration-runner.test.mjs`, `repository-schema.test.mjs`, affected latest-version assertions and root/storage test registrations. Create `packages/storage/test/native-analysis-state.test.mjs` for this and Task 2.

**Interfaces:** Consume the existing migration runner/manifest API. Produce exactly the spec's two tables at schema version 10; no data/write API yet.

- [x] Write `R010 creates empty derived tables without altering R009 data`, `R010 migration failure rolls back`, and `R001-R009 manifest checksums remain identical`. Assert in test code:
  ```js
  assert.equal(versionAfterUpgrade, 10);
  assert.deepEqual(readDerivedRows(), { headers: [], files: [] });
  assert.deepEqual(readExistingStateAfterReopen(), stateBeforeUpgrade);
  assert.deepEqual(manifest.migrations.slice(0, 9), releasedEntries);
  ```
  Capture `releasedEntries` from the accepted baseline before editing the manifest. Exercise fresh database, R009 upgrade/rerun, malformed migration rollback, FK/JSON/uniqueness constraints, too-new refusal and unchanged workspace migrations. Historical fixtures explicitly pinned to R009 stay pinned; only latest-version expectations advance.
- [x] Run `node --test packages/storage/test/native-analysis-state.test.mjs packages/storage/test/migration-runner.test.mjs packages/storage/test/repository-schema.test.mjs`; expect new version/table assertions to fail, not harness/import errors.
- [x] Write spec-exact SQL and append its real normalized checksum to the manifest; no source inventory FK or backfill. Register every B1 case by named test and governing design/acceptance.
- [x] Build Storage and rerun the above plus `migration-runner-application.test.mjs`, `migration-runner-failures.test.mjs`, `repository-constraints.test.mjs`; expect zero failures and unchanged released migration checksums.
- [x] Stage only this task's SQL/manifest/test/Fixture/runner files and commit `feat(storage): release derived native state migration`.

## Task 2: Bounded read, validation port and sealed metadata (B1)

Execution clarification on 2026-10-01: the user confirmed the written measured-admission rules, approved this amended plan with “继续”, and approved the actual Windows report/reservation with “批准”. Read/staging/validation and one exact-match Runtime profile are implemented locally. CURRENT_STATUS records production admission/refusal tests, the unaltered raw baseline and fresh full regression (719 total, 718 pass, zero fail, one existing Windows skip). Task 2 local verification is complete; commit bookkeeping follows. Tasks 3–6 retain remeasurement/review for changed measured paths. Do not substitute the Rust worker reservation, a guessed JSON-size multiplier or preliminary schema-only probes for calibration.

**Files:** Create Storage `analysis/native-analysis-state.ts`, Providers `native-analysis-validation.ts`, Runtime `native-analysis-validation.ts`; modify Storage `analysis/temp-stage.ts` and relevant `src/index.ts`; extend B1 cases/test; create `packages/runtime/test/native-analysis-state-read.test.mjs` and register it.

Calibration files in this same task: create Runtime internal `src/native-metadata-admission.ts` and `src/native-metadata-profiles.ts`; test-only `packages/runtime/test/helpers/native-metadata-corpus.mjs` and `native-metadata-worker.mjs`; required `packages/runtime/test/native-metadata-admission.test.mjs`; CLI harness `scripts/bench-native-metadata-memory.mjs`; extend the existing B1 `cases.json` with `memoryCases`. Store reviewed raw measurements at `fixtures/storage/native-analysis-state/memory-baseline.json`. These are planned files, not passing evidence. Runtime must not import test helpers or Fixture files; the internal profile module contains only reviewed release values and their evidence identity.

**Interfaces:** Produce the shared types above and:
`captureNativeActivationToken(db: DatabaseSync, repositoryId: string): NativeActivationToken`;
`readNativeAnalysisState(db: DatabaseSync, expected: NativeStateExpectation, validate: NativeStateValidationPort, limits: {maxSerializedBytes:number;memoryBudgetBytes:number}): NativeBaselineResult`;
`RepositoryAnalysisStage.acceptNativeSummary(value: unknown): Promise<void>`;
`sealNativeState(headerJson: string, expected: NativeStateExpectation, validate: NativeStateValidationPort, limits: {maxSerializedBytes:number;memoryBudgetBytes:number}): ValidatedNativeState`;
`readSealedNativeState(): ValidatedNativeState`.
Runtime exports `createNativeStateValidationPort()` from its adapter. Providers exports `validateNativeStateCandidate(input: NativeStateValidationInput): ValidatedNativeState` structurally without importing Storage; Runtime checks that signature against the Storage port.

Additional internal interface: `assertNativeMetadataAdmission(memoryBudgetBytes: number): void` in Runtime's admission module selects the matching reviewed profile and throws the typed resource refusal before delegating to Provider validation. Storage preflights all retained SQL strings and supplies the remaining budget to that port; its original caller budget remains unchanged. Profiles carry Node/V8/platform/architecture, implementation/corpus identity, peak collection method/units, and `reservationBytes`, without changing wire/IR or the public factory signature.

Pin identity as SHA-256 of deterministically sorted, path-delimited, LF-normalized built JavaScript in IR/Storage/Providers/Runtime, excluding the profile data module to avoid self-reference, plus the exact Zod version. Use package-resolved installed directories, not a source-checkout-only path; calculate the same identity in calibration and production. Include identity calculation in measurements. Node/V8/platform/architecture matching is exact; a dependency/code/environment mismatch requires remeasurement, never silent profile fallback.

Extend the existing stage constructor compatibly to `new RepositoryAnalysisStage(db, nativeLimits?)`, where optional `nativeLimits` has the existing `{maxSerializedBytes:number;memoryBudgetBytes:number}` shape. Legacy callers remain unchanged. Nonempty `acceptNativeSummary` requires declared limits before retention; a zero-summary seal can use its explicit seal limits. Native Runtime composition supplies request limits before accepting metadata. Bound generic JSON serialization/retained metadata before storage without embedding Provider schemas in Storage; reject cyclic/non-JSON/oversize input and do not first build an unbounded serialized string. The semantic validation port remains mandatory at seal.

The test-only measurement worker may inject the same pure `validateNativeStateCandidate` directly into the real Storage read/seal APIs to measure the core before a Runtime profile exists. This is a read-only/provisional calibration composition, not production bootstrap or a publication path; it has no Canonical Store/Apply dependency and may not publish, synthesize a success profile or bypass the normal Runtime port. No calibration switch or test cleanup method belongs in production classes. The public Runtime factory always performs admission.

- [x] Write the pinned corpus helper and calibration runner tests. Index these exact classes in `memoryCases`: `zero-file`, `empty-file`, `maximum-short-files`, `dense-numeric-sites`, `long-ascii`, `long-bmp`, `long-astral`, `repeated-shared-owners`, `duplicate-metadata`, `foreign-metadata`, `deep-unknown-input`, `oversized-sql-column`, `oversized-staged-fact`. Use the existing schemas and independent digest vectors; grow valid cases up to the existing serialized ceiling, retain expected INVALID/RESOURCE outcomes for invalid cases, and exercise actual read and full-stage seal where applicable. Never count schema-only probes as read/seal coverage.
- [x] Write `uncalibrated Runtime refuses before Provider decoding`, `changed implementation invalidates profile`, `retained SQL strings reduce admission headroom`, and `one byte below reviewed reservation refuses`. Assert the existing safe resource refusal, no validator invocation for preflight refusal, no open transaction and exact unchanged persistent rows. Success tests use the independently recorded profile's reservation plus SQL charge after review, not the old draft helper's 16 MiB number.

- [x] Write `reconciliation preserves stale indexed baseline`, `bounded read rejects before parse`, `read validates columns and snapshot provenance`, `read errors are not missing`, `sealed stage rejects every writer`, and `validation port is mandatory`. Assert:
  ```js
  assert.equal(readBaseline().status, 'AVAILABLE'); // after reconciliation, before replacement
  assert.equal(readFreshness(), 'STALE');
  assert.deepEqual(readOverBudget(), { status: 'UNAVAILABLE', reason: 'RESOURCE_LIMIT_EXCEEDED' });
  await assert.rejects(sealedStage.acceptNativeSummary(extra));
  assert.deepEqual(persistentStateAfterRead(), persistentStateBeforeRead());
  ```
  Cover header/file drift, count/digest/malformed JSON, duplicate/foreign ownership, missing snapshot, non-SUCCEEDED provenance, absent port, incompatible grammar/analyzer/resolver/normalizer/policy/capabilities, worker/root independence, changed/immutable revision, empty legacy baseline and actual SQLite lock/I/O errors. Use a second connection to prove one coherent read snapshot; no background scheduler.
- [x] Build changed packages and run `node --test packages/storage/test/native-analysis-state.test.mjs packages/runtime/test/native-analysis-state-read.test.mjs packages/storage/test/analysis-temp-stage.test.mjs`; expect new behavioral failures.
- [x] Implement the port/read API using one read transaction and bounded iterators. Add TEMP metadata to the existing stage, bounded by bytes/request memory; seal after normalization/merge and reject all subsequent fact/metadata/normalized/support writes. Distinguish validation refusal from operational SQLite errors. R009 reads return MISSING only by explicit schema inspection; R010 bootstrap requires the migration, never runtime CREATE TABLE.
- [x] Implement the internal Runtime admission wrapper and the shell-free test harness. Run `node scripts/bench-native-metadata-memory.mjs` with one fresh child per case/repetition and five repetitions; emit the measurement report to stdout, never silently rewrite a baseline or install a production profile. Record environment/implementation/corpus identity, start/preparation/validation observations, exact serialized/SQL sizes and absolute process peak memory with units. Missing peak measurement or an unexercised read/seal case makes the report unusable as a release profile. Select the maximum observed absolute peak, including runtime/module baseline; no guessed margin or subtraction. Add retained SQL strings separately at two bytes per UTF-8 byte; do not double-add overlapping `external` and `arrayBuffers` measurements.
- [x] Present the actual report/reservation for review before populating `native-metadata-profiles.ts` or claiming supported admission. After review, save the raw report with evidence identity in `memory-baseline.json`, populate only matching validated environment entries, and run `node --test packages/runtime/test/native-metadata-admission.test.mjs`. On unmeasured platforms, exercise fail-closed behavior and report success-path calibration as unavailable rather than fabricating portable values. Register the functional admission cases in required root/Runtime tests; expose the five-run benchmark as Runtime `bench:native-metadata`, not an automatic baseline writer. Required CI verifies its applicable profile against fresh measurements before capability publication; absent hosted/Linux evidence remains explicit.
- [x] Rerun those tests and `node scripts/check-architecture.mjs`; expect zero failures, 17 projects and no `storage -> providers` dependency. Record memory-accounting evidence without claiming an RSS bound from byte totals.
- [x] Commit only Task 2 files and registrations: `feat(storage): validate bounded native baseline reads and staging`.

Tasks 3–6 must invalidate and remeasure the profile when they change correspondence, transport or staging workspace: rerun the same benchmark on the actual changed path, retain the report/review gate and update the profile before claiming that path admitted. Task 7 requires applicable hosted-platform evidence; local Windows measurements alone cannot pass its hosted gate. This adds no roadmap task, original phase threshold or earlier REFRESH capability.

## Task 3: Strict full-v3 response and shared correspondence corpus (B2)

**Files:** Create `packages/providers/src/native-analysis-output-v3.ts`, `packages/providers/test/native-analysis-output-v3.test.mjs`, `fixtures/ipc/analysis-v3/cases.json` (`p05-native-v3-full-output-v1`) and indexed raw JSONL cases; modify validation adapter, Providers exports, Rust `analysis_state.rs`/`lib.rs` shared tests, `.gitattributes`, required test scripts.

**Interfaces:** Produce the full-v3 types above and `NativeFullAnalysisEventV3Schema`; `decodeNativeFullAnalysisV3(request: NativeFullAnalyzeRequestV3, lines: AsyncIterable<Uint8Array>, sink: {accept(event: NativeFullAnalysisEventV3):Promise<void>}, limits: NativeClientLimits): Promise<{terminal:NativeFullAnalysisTerminalV3}>`. Reuse existing byte syntax primitives/checksum conventions. The shared case runner passes facts/metadata to the validation port; no persistent Apply here.

- [x] Write corpus-driven tests `full v3 separates summary and graph counts`, `summary identities match observed facts`, `shared package owners are grounded and complete`, `malformed full streams are never applicable`. Assert exact terminal counts/digest and rejection of each indexed invalid case, e.g.:
  ```js
  assert.equal(valid.terminal.payload.summaryRecords, requestedFiles.length);
  assert.deepEqual(valid.terminal.payload.counts, expectedGraphCounts);
  await assert.rejects(decodeCase('missing-shared-owner'));
  await assert.rejects(decodeCase('valid-summary-wrong-emitted-fact-digest'));
  ```
  Index valid full/zero/zero-file/PARTIAL, duplicate/missing/foreign summaries, mixed ownership, missing package declaration, compilation-unit FILE ownership, coverage/diagnostic multiset drift, deterministic source-less origin/run-global diagnostic, wrong context, unknown keys, unsafe/-0/nonfinite numbers, Unicode scalar ordering, wrong sequence/start/terminal/count/raw checksum, BOM/CRLF/UTF-8, oversized line/event/total and illegal REFRESH output. Preserve independent packet A digest vectors.
- [x] Build Providers; run `node --test packages/providers/test/native-analysis-output-v3.test.mjs`; run `cargo test -p codeatlas-native-analyzer analysis_state`; expect new cases to fail behaviorally until validation exists.
- [x] Implement the exact spec union and streaming decoder; validate correspondence using actual staged Provider facts, excluding only snapshot ID from fact digests. Extend the existing Rust summary validation tests to consume the same indexed payload vectors; raw response framing is additionally tested against the real writer in Task 5, not claimed from summary-only Rust tests. Protect new raw JSONL with `-text`.
- [x] Rerun those tests plus existing `native-analysis-state.test.mjs`, `native-ipc-v3.test.mjs`, `native-ipc-bytes.test.mjs`; require every cases-index entry executed, unchanged packet A/v1/v2 schemas and zero failures.

Task 3 evidence: output suite 44/44 (14 raw and 21 shared payload vectors plus functional cases); focused regression 70/70; full root Node 762 pass/one existing Windows skip; Cargo workspace 88/88 and existing real-binary suites 25/25. Build/type/architecture/fmt/Clippy pass. The unchanged read/seal benchmark reports 65 observations for the new built identity and proposes 250,855,424 bytes plus twice retained SQL bytes. Hold before profile installation, task completion and commit until explicit numeric-report approval; CURRENT_STATUS records exact identity and raw-report location. The old profile mismatches and fails closed. This is not new decoder/process-transport workspace calibration; Task 4 must measure its actual path.

Task 3 numeric approval update (2026-10-01): the user answered the exact reservation question with “继续”. The unaltered report is preserved separately at `fixtures/storage/native-analysis-state/memory-baseline-task3.json`, SHA-256 `a9451c810ae270340cb499cac5dbf01d0fe274b755861a6725b4576eb17815b1`, with capture status unchanged. The current-build Windows read/seal profile now reserves 250,855,424 bytes plus twice retained SQL UTF-8 bytes; Task 2 report/profile is unchanged. Production matching-profile and one-byte-below/refusal checks passed within 83/83 focused tests after explicit RED for the absent current profile. Earlier pending-review/current-build refusal wording is historical and superseded by this approval/install record. Final post-approval root Node regression passes 762 with one existing Windows skip; focused tests pass 83/83, Cargo 88/88, existing real Native tests 25/25, build/type/architecture/fmt/Clippy/format/diff pass. Local Task 3 is complete. Decoder/transport workspace admission is still Task 4 work; no real producer/bootstrap/REFRESH or phase exit is claimed.

- [x] Commit `feat(providers): validate full v3 summaries and fact correspondence` with only this task's files.

## Task 4: Bounded full-v3 process transport (B2)

Execution clarification: include a purpose check in Runtime's internal metadata admission and optional full-transport evidence fields in the excluded profile-data module. Required tests prove that a reviewed read/seal-only profile cannot admit unreviewed `FULL_TRANSPORT`. Measure the actual shell-free process/decoder/awaited TEMP stage/pure Provider seal in five fresh processes per corpus case, preserving read/seal measurement separately; no guessed reservation is installed. Task 6 must call the full-transport admission purpose before serialization/spawn. This enforces existing accepted memory admission and keeps public Provider/v1/v2/factory signatures unchanged.

**Files:** Modify `packages/providers/src/native-client.ts` and exports; create `packages/providers/test/native-full-v3-client.test.mjs` and its fake-process cases using the existing client-test helper pattern; extend B2 cases and runner registrations.

**Interfaces:** Consume Task 3 decoder. Produce `streamNativeFullAnalysisV3(request: NativeFullAnalyzeRequestV3, options: NativeClientOptions, sink: {accept(event:NativeFullAnalysisEventV3):Promise<void>}): Promise<{terminal:NativeFullAnalysisTerminalV3;stderr:string}>`. Keep `NativeAnalysisSink` and public v1/v2 result unions unchanged; reuse private lifecycle plumbing only where needed.

- [x] Write `slow sink prevents read-ahead`, `v3 request waits for drain`, `oversize summary kills process without result`, `cancel between input header and completion`, `failure never returns applicable terminal`. Assert:
  ```js
  assert.equal(maxConcurrentAccepts, 1);
  assert.equal(eventsAcceptedWhileSinkBlocked, 1);
  assert.ok(writtenRequestBytes <= 1_000_000);
  await assert.rejects(cancelledRun);
  assert.equal(activeApplyCalls, 0);
  ```
  Exercise stdin/stdout/stderr/line/event lower limits and hard-ceiling overrides, timeout, truncated stream, child nonzero exit, EPIPE and output after terminal. Fake process must verify the exact two-record request checksum and report if source work starts before completion.
- [x] Build Providers; run `node --test packages/providers/test/native-full-v3-client.test.mjs`; expect new lifecycle/buffering assertions to fail.
- [x] Implement complete bounded request serialization and drain-aware writing, awaited incremental stdout decoding and process cleanup. No whole-output result array, chunk protocol, shell command or side-channel file. Metadata temporary allocations obey request memory admission, not an invented constant.
- [x] Run new tests plus `native-client.test.mjs`, `native-analysis-stream.test.mjs` and `native-ipc-bytes.test.mjs`; expect zero failures, no leaked process/listener and unchanged existing client behavior.
- [x] Commit `feat(providers): stream bounded native full v3 requests`.

Task 4 paired measurement (2026-10-01): exact Node `v24.15.0` / V8 `13.6.233.17-node.48` / win32/x64 / Zod `4.6.1`, built identity `91931ccddf3b3eae0687e07cae23b9da14901976596811f178cf2f1b7bf8f09c`. Read/seal: 13 classes × five fresh processes = 65 observations, absolute peak **247,132,160 bytes**; full transport: 14 classes × five = 70 observations, absolute peak **196,911,104 bytes**. Proposal: the larger **247,132,160 bytes (235.68359375 MiB) plus twice actual retained SQL UTF-8 bytes**. The original capture status of both raw reports is retained; the subsequent approval/installation record below supersedes the pre-approval proposal. Earlier Task 2/3 profiles are preserved. This is Node workspace evidence using a checksum-verifying test child, not real Rust v3 production, a hard RSS bound, Linux evidence or a phase performance gate.

Task 4 numeric approval (2026-10-01): the user explicitly approved **247,132,160 bytes plus twice actual retained SQL UTF-8 bytes**. The paired raw reports are preserved unchanged at `fixtures/storage/native-analysis-state/memory-baseline-task4-read-seal.json` (SHA-256 `9dca28c23dd8fed77d22374505123b0984a782c700b6590838cee4ce4858e262`, 65 observations) and `memory-baseline-task4-transport.json` (SHA-256 `b7154f67fd8cbcf459eacbcd7405e3788dd9a47ef2bbdf2803390ce778dcda65`, 70 observations); original capture status remains `PROVISIONAL_REVIEW_REQUIRED`, with subsequent approval recorded here. Install only the matching Node/V8/win32/x64/Zod/built identity `91931ccddf3b3eae0687e07cae23b9da14901976596811f178cf2f1b7bf8f09c`, with full-transport corpus/evidence digests and measured transport peak 196,911,104 bytes. Task 2/3 raw reports/profiles remain unchanged. Missing/mismatched environments still fail closed. The profile-data module is excluded from implementation hashing, so installation changes no measured implementation. This is not real Rust v3 producer/bootstrap, hosted/Linux evidence, a hard RSS guarantee or a phase performance threshold.

Reviewed raw report identities and post-approval command evidence are recorded in CURRENT_STATUS. Current matching read/seal/full-transport and one-byte-below/read-only-profile refusal tests pass. Root/Provider Node test runners execute serially to prevent contention-driven fixture deadlines without changing any timeout, cap or assertion; final exact registered root entry passes 795 with one existing Windows skip (exit 0); Task 4 gates are complete.

## Task 5: Real Rust full-summary producer (B2)

**Files:** Modify Rust `analyze.rs`, `protocol.rs`, `analysis_state.rs`, `request_v3.rs`, `lib.rs`; create `packages/providers/test/native-full-v3-binary.test.mjs`; extend B2 cases/required native runner. Reuse registered `java-call-basic`, `java-overload`, `java-inheritance`, `java-unresolved-call`, `java-coverage-zero` and syntax/unsupported fixtures; do not create a parallel source truth.

**Interfaces:** Consume accepted request_v3 validation and existing LanguageAnalysis. Add Rust `run_full_v3<W: Write>(request: &serde_json::Value, workers: usize, output: &mut W) -> Result<(), String>` behind the existing dispatch; existing caller error classification remains authoritative. Produce Task 3's exact JSONL types. Pin `JAVA_RESOLVER_VERSION` to `"1"`; compare native-owned provider/language versions to the binary, not caller echoes. Do not advertise v3 yet.

- [x] Write real-binary tests `full v3 graph equals v2`, `all contributing files own shared package`, `worker completion order preserves graph and summary digest`, `wrong producer context rejected before parse`, `v3 refresh remains rejected`. Assert:
  ```js
  assert.deepEqual(canonicalize(v3Facts), canonicalize(v2Facts));
  assert.equal(summaryCount, request.payload.sourceFiles.length);
  assert.equal(sharedNodeEmissionCount, 1);
  assert.deepEqual(sharedOwners, packageDeclaringFileIds);
  assert.equal(workerOne.header.summaryDigest, workerMany.header.summaryDigest);
  ```
  Reuse fixture ground truth and canonical comparison excluding only run identities; independently verify summary digests. Include empty scope/file, PARTIAL syntax failure, source mutation between passes, resolver imports/inheritance needed for a requested CALL without IMPORT output, SYMBOL-only empty relations, static/overload/unresolved sites, oversize summary/memory refusal and cancellation. Rust unit tests prove no parse before validated completion.
- [x] Run `cargo build --workspace` then `node --test packages/providers/test/native-full-v3-binary.test.mjs`; expect unsupported full-v3 dispatch/new assertions to fail. Do not regenerate old goldens to make it green.
- [x] Implement full-only dispatch after bounded complete input; retain the existing two source-verified passes and resolver inputs, emit per-file summaries with actual fact digests and deterministic diagnostic attribution. Extend EventWriter for metadata counts/raw checksum and admission; shared containers emit once but summarize every grounded owner. Terminal state uses binary-owned compatibility and exact context. REFRESH returns the existing explicit unsupported failure.
- [x] Run that binary suite, `cargo test --workspace`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, plus existing real Java/coverage suites. Require graph equivalence, all shared cases executed and unchanged v1/v2 behavior. Protocol advertisement still `[1,2]` until Task 7.
- [x] Commit `feat(native): emit validated full analysis summaries over v3`.

Local verification: 26 real full-v3 tests; combined Native runner 51/51; Rust 94/94; root Node 795 pass/one existing Windows skip. Producer entry uses the existing NonZeroUsize/io::Result<ExitCode> lifecycle instead of illustrative usize/String; Node v3 failure detail is tested on raw binary output. Whole-branch review remains after Task 7; no publication or phase exit.

## Task 6: Atomic full bootstrap and legacy invalidation (B3)

**Files:** Modify Storage `analysis/canonical-fact-store.ts`, `analysis/temp-stage.ts` and exports; create Runtime `native-full-bootstrap.ts`, `packages/runtime/test/native-full-bootstrap.test.mjs`, `fixtures/storage/native-full-bootstrap/cases.json` (`p05-native-full-bootstrap-v1`); extend Storage full/patch tests and Application full tests; register new suites. Existing Application API need not gain Provider types.

**Interfaces:** Consume Tasks 2/4/5 and existing Application `applyFullAnalysis`. Produce Store `applyNativeAnalysisBatch(stage:RepositoryAnalysisStage, expected:ExpectedAnalysis, baseline:NativeActivationToken):number` (existing DB-lock measurement convention). Runtime produces `applyNativeFullBootstrap(database:DatabaseSync, request:NativeFullAnalyzeRequestV3, options:NativeClientOptions, descriptor:NativeAnalyzerDescriptor, trustedContext:NativeStateExpectation):Promise<FullAnalysisMeasurement>` and `readNativeFullBaseline(database:DatabaseSync, expected:NativeStateExpectation, limits:{maxSerializedBytes:number;memoryBudgetBytes:number}):NativeBaselineResult`. Trusted context is supplied by the explicit source-policy caller; it is checked against the complete selected request scope, not derived from arbitrary wire strings. Define `JAVA_NORMALIZER_VERSION = '1'` in `packages/providers/src/java-node-normalizer.ts`, export it and use it here.

- [ ] Write `real bootstrap reopens identical validated baseline`, `same-fingerprint concurrent activation loses token race`, `late failure rolls back graph and summaries`, `legacy success clears state even at equal fingerprint`, `legacy failure and reconciliation preserve state`. Assert:
  ```js
  assert.equal(reopenedBaseline.status, 'AVAILABLE');
  assert.deepEqual(reopenedBaseline.state, activatedState);
  assert.deepEqual(afterInjectedFailureAndReopen, beforeAttempt);
  assert.deepEqual(afterConcurrentRejectionAndReopen, winningActivation);
  assert.equal(afterSuccessfulLegacyWrite.status, 'UNAVAILABLE');
  assert.equal(afterFailedLegacyWrite.status, 'AVAILABLE');
  ```
  Compare nodes/edges/unresolved, active/historical Evidence, FactEvidence, bindings, R009 candidates, snapshots/coverage/diagnostics, both summary tables and indexed fields. Inject SQL failures via test triggers after support retirement, summary deletion/insertion and pointer update; no production failure knob. Test successful/failed legacy full and patch separately, stale target inventory, missing/incompatible state without automatic parsing, zero-file/zero-fact success and PARTIAL/failure refusal. Use the already registered real Java fixtures, not synthetic-only success evidence. Add `unreviewed transport profile refuses before serialization/spawn`; assert the source/serializer/process observation counters remain zero, including a matching read/seal-only profile.
- [ ] Build affected TS packages and run `node --test packages/runtime/test/native-full-bootstrap.test.mjs packages/storage/test/canonical-fact-store.test.mjs packages/storage/test/analysis-patch-store.test.mjs packages/application/test/apply-full-analysis.test.mjs`; expect new atomic lifecycle assertions to fail.
- [ ] Implement Runtime capture-before-observe → stream/await-stage → correspondence → normalize/merge → seal → Application success/context check → Store transaction → finally close. Reuse the existing full transaction body through a narrow internal shared path, not a second publication API. Check sealed state, source inventory/snapshot and captured token before mutation and again under `BEGIN IMMEDIATE`. Clear all repository headers then insert this run's sealed state/files, with graph/support/snapshot/pointer changes in the same commit. Legacy full/patch clear headers within their existing transactions only on successful Apply. R009 legacy databases retain existing behavior by explicit schema-version/table detection, never suppressed SQL errors; bootstrap requires R010. Runtime must call `assertNativeMetadataAdmission(memoryBudgetBytes, 'FULL_TRANSPORT')` before request serialization or child spawn, in addition to existing retained SQL accounting and mandatory correspondence seal.
- [ ] Rerun those tests plus baseline-read, temp-stage, full/patch composition, source-state and active-support suites; run architecture check. Require exact reopened rollback, no stage leaks, no implicit parse/read write and unchanged Application/Canonical IR dependencies.
- [ ] Commit `feat(runtime): atomically bootstrap native state with full analysis`.

## Task 7: Handshake publication and complete required gate (B4)

**Files:** Modify Rust `protocol.rs`, existing handshake test/expected descriptor artifacts identified by `rg` before edits, root/affected package scripts, `.github/workflows/ci.yml` only if its current scripts do not cover new tests; update this plan, packet B spec, Handoff Architecture/Status/Authority/Roadmap/WBD/Acceptance/Traceability/Deferred Decisions and SQLite/IPC/Evaluation specs as affected. No unrelated deferred decision changes.

**Interfaces:** DESCRIBE produces `[1,2,3]` only after Tasks 1–6 pass. No incremental capability appears. Runtime explicit v3 full selection uses this descriptor; v1/v2 full indexing remains available.

- [ ] Write `descriptor advertises full v3 only after complete support` and `advertised v3 still rejects refresh`; assert protocol list `[1,2,3]`, unchanged IR/capabilities and explicit REFRESH refusal. Confirm each new cases/Fixture/test is exercised by required scripts rather than optional manual execution.
- [ ] Run real handshake suite before changing the expected list; expect the new descriptor assertion to fail with actual `[1,2]`.
- [ ] Publish exact descriptor version-list change and only its governed handshake expectations; do not rewrite unrelated v1/v2 JSONL goldens. Register new nonbinary tests in root/package test scripts and real tests in `test:native-analysis`, reached by hosted Native Java CI. Synchronize controlling docs with actual evidence, R010 checksum and packet B completion only; mark parent real REFRESH and original phase gates still open.
- [ ] Run the full gate on the completed branch:
  ```text
  pnpm verify
  node node_modules/prettier/bin/prettier.cjs --ignore-path NUL --check docs/superpowers/plans/2026-10-01-p05-w3-020-state-bootstrap.md docs/superpowers/specs/2026-10-01-p05-w3-020-state-bootstrap-design.md
  git diff --check
  ```
  `pnpm verify` must include all newly registered tests, TS builds/type tests, architecture (17 projects), Rust build/fmt/Clippy/tests and real native suites. If a local package-manager/linker restriction prevents it, record the actual failure and run every equivalent declared command; do not call the wrapper passed or claim hosted CI passed without observing its exact commit/run. Check relative Markdown links in changed docs. Archive command/version/count/corpus/rollback evidence in CURRENT_STATUS, with unavailable internal performance metrics explicitly unavailable rather than zero.
- [ ] Commit `feat(native): publish full v3 bootstrap capability and evidence` after fresh verification. Using the preserved native execution method, request one independent whole-branch correctness review and repair/reverify actionable findings. Push/create PR only when authorized; attach any created PR to this chat. Do not auto-merge or begin the REFRESH packet from plan approval alone.

## Dependencies, exit and self-review

Recommended native sequence: 1 → 2 → 3 → 4 → 5 → 6 → 7. After shared interfaces are pinned, B1 persistence/read and B2 corpus authorship are safe parallel candidates, but this plan does not dispatch agents. Stage/Store/Runtime ownership changes remain sequential; real bootstrap depends on the real producer.

Packet B exit requires all four Fixture/check groups, real Rust full bootstrap and reopen validation, bounded process/state reads, complete atomic rollback and legacy invalidation, runner execution, architecture and synchronized fresh evidence. It does not complete P05-W3-020 or promote Phase 0.5. The next packet requires a separate detailed REFRESH composition design/plan.

Self-review on 2026-10-01: B1 maps to Tasks 1–2, B2 to 3–5, B3 to 6 and B4 to 7; all five Review Focus cases have owning tests. Read validation is distinguished from full-stage correspondence; no provider stream is reconstructed from Canonical representatives. Shared interfaces and new compatibility identifiers are explicitly pinned; language shape was checked against the current Provider schema. Seven independently testable tasks each carry RED/GREEN and a focused commit. The accepted admission amendment maps SQL preflight, read/seal calibration, profile identity, refusal, required tests and report review to Task 2, with remeasurement in Tasks 3–6 and hosted publication checks in Task 7. No numeric release reservation, new phase threshold, dependency or deferred capability is added. Task 1 checkboxes are executed; Task 2 remains test-first pending amended-plan review; Tasks 3–7 remain unexecuted. Native execution remains selected.
