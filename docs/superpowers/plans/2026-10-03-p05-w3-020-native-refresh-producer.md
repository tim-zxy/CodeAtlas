# P05-W3-020-C Native REFRESH Producer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a bounded real Java REFRESH patch from compatible retained summaries and validate its strict v3 output without publishing SQLite state.

**Architecture:** Reuse the accepted summary v1, DeclarationIndex, verified source access and full-analysis fact recipes. Parse only added/modified files, conservatively re-resolve all target summary sites and diff complete ownership ledgers. Keep Runtime/Store activation and end-to-end phase Evaluation in separately reviewed D/E packets.

**Tech Stack:** Existing Node `>=24 <25`, TypeScript/Zod, Rust edition2024, Tree-sitter Java, SHA-256 and JSONL; `pnpm@11.19.0`. No new dependency.

**Spec:** [Accepted packet C design](../specs/2026-10-03-p05-w3-020-native-refresh-producer-design.md), confirmed by the user after local design commit `919d6b7` on2026-10-03. The user subsequently approved this plan/native execution and PR#18 merge; exact merge73756f0 CI succeeded. Task1 is in progress and now held on the [proposed C1 memory preflight amendment](../specs/2026-10-03-p05-w3-020-c1-memory-preflight-proposal.md). The proposal is not accepted and does not silently modify any checklist/requirement below. Tasks2–6 remain unstarted; no completion is claimed.

## Global Constraints

2026-10-03 direction-only update: the C1 preflight proposal now has written detail, awaiting review. Its proposed extension sequence is recorded there; do not rewrite/execute these six approved task bodies or mark C1 complete before written amendment acceptance and revised-plan review. Preserve native execution and separate numeric approval. No revised implementation plan is claimed ready by direction approval.

- Read AGENTS/Handoff authorities, relevant ADR-010/014/015/016, specs and Fixture manifests before coding. Confirm B integration or explicitly authorized stacked base first; last observed PR#18 headff3f731 is CI green but open. This plan does not authorize remote merge or main mutation.
- Execute C only: strict output contract, real producer and task-local evidence. D atomic overlay seal/SQLite coactivation/refresh transport admission and E persisted differential/phase benchmarks remain outside this plan. Phase0.5 remains10/14 integrated; do not check parent/phase exits.
- Same mutable WORKTREE revision ID only. Unsupported producer invocation uses existing wire `INVALID_REQUEST`; D later exposes application `FULL_ANALYSIS_REQUIRED` before spawn. No Native error-enum extension.
- Preserve aggregate stdin and each line1,000,000 bytes, stdout10,000,000 bytes, events10,000 and stderr1,000,000 bytes; callers may lower, never raise. Summary/header serialized envelope remains bounded by1,000,000 bytes. Metadata consumes counts/bytes, not Canonical fact counters.
- Only added/modified source files enter the parser. The unchanged-source reparse set is empty. Re-resolve all requested target summary sites under existing deadline/memory budgets; fail closed rather than omit sites or silently full-reparse.
- Keep summary/header schema1, strict v1/v2/full-v3, Canonical IR1, ProviderSnapshot1, migration files/checksums, source-policy boundary and DESCRIBE capabilities unchanged. No public SPI, new configuration knob or deferred capability.
- Success terminal is an observation, not an applicable SQLite candidate. Partial observations are never authorized to activate. Provider facts remain below Canonical normalization; Rust owns no database.
- New Provider built JS changes the exact memory identity. Recalibrate **existing READ_SEAL/FULL_TRANSPORT** compatibility in Task5 and stop for exact numeric approval; this is not REFRESH admission. Preserve immutable historical reports/profiles. Do not borrow another build's approval floor or accept synthetic rows as measurements.
- Retain original critical symbol recall≥95%, direct-call precision≥95%/recall≥90%, declared incremental correctness100% and stale bindings0. Invent no latency, memory or dependency-count threshold.

## Review Focus

1. A declaration addition resolves an unchanged old unknown caller, even with no old resolved reverse edge: re-resolve and upsert only its changed edge (Tasks3/4).
2. Removing the lexically first shared-container owner must not remove or replace a node still owned by another file (Tasks2/4).
3. A forged per-file owner with the same union/digest must be rejected; union equality alone is insufficient (Tasks1/2).
4. Source scanner's latest delta can be empty after failure: C validates complete baseline-to-target delta; empty changes with differing inventories fail before parse (Tasks1/3; persisted retry belongs to D).
5. Cancellation, slow sink or changed Node identity must not expose successful partial output or admit the old memory profile (Tasks1/4/5).

## File map and interfaces

New names below are plan decisions, not existing APIs. Follow existing package/Fixture conventions; do not add a new framework.

- `packages/providers/src/native-refresh-output-v3.ts`: isolated schema/stream validator. Export `NativeRefreshRequestV3 = Extract<NativeRequestHeaderV3,{type:'REFRESH'}>`, `NativeRefreshEventV3`, `NativeRefreshTerminalV3` and `NativeRefreshEventV3Schema`.
- `decodeNativeRefreshV3(requestBytes: Uint8Array, lines: AsyncIterable<Uint8Array>, sink: {accept(event: NativeRefreshEventV3): Promise<void>}, limits: NativeClientLimits): Promise<{terminal: Extract<NativeRefreshTerminalV3,{type:'REFRESH_COMPLETED'}>}>`: validates bounded request bytes with existing `decodeNativeRequestV3`, complete output and ledger correspondence. Failed terminal throws existing `NativeClientError` with `ANALYZER_FAILED`; provisional sink rows confer no applicability. No process spawn/SQLite.
- `crates/native-analyzer/src/retained.rs`: summary-to-language decoding; `RetainedFile {source_file: Value, analysis: LanguageAnalysis, coverage: Vec<Value>, emitted_facts: Vec<Value>}` and `decode_retained_file(value: &Value) -> Result<RetainedFile,V3ContractError>` after strict summary validation, checked number conversion. No source access.
- `crates/native-analyzer/src/analyze/refresh.rs`: binary-private refresh producer, child of existing analyze module, reusing its resource/source/serialization helpers rather than exposing a generic analyzer framework. `pub(super) fn run<W:Write>(request:&ValidatedRequestV3, workers:NonZeroUsize, output:&mut W)->io::Result<ExitCode>`.
- `analyze.rs`: declare child module and `pub(crate) fn run_refresh_v3<W:Write>(request:&ValidatedRequestV3, workers:NonZeroUsize, output:&mut W)->io::Result<ExitCode>` delegating to that child. Extract narrow private fact payload helpers shared by full and refresh; keep existing full event/byte behavior.
- `fixtures/ipc/refresh-v3/cases.json`, request/event `.jsonl`, `payload-vectors.json`: C1 custom byte index, ID `p05-native-v3-refresh-output-v1`, schema1/taskP05-W3-020-C/design/acceptance pointers. Use packet B's custom-index convention, not an invented Evaluation registry schema.
- `fixtures/native/java-refresh-producer/fixture.json`, `source/`, `expected/transitions.json`: C2 registered Fixture ID `p05-native-refresh-producer-v1`, category `code-intelligence`, phase `0.5`, Java, existing five capabilities, no frameworks. Use existing FixtureManifestV1 fields; input source plus independently authored transition expectations. Do not assign new quality-gate numbers.
- `packages/providers/test/helpers/native-refresh-v3-corpus.mjs`: `loadRefreshCase(name)` returns validated request bytes and immutable expected event bytes from C1 files; `chunkBytes(bytes,size=31)` yields raw chunks. No product algorithm copied into expectations.
- `packages/providers/test/native-refresh-output-v3.test.mjs` and `native-refresh-v3-binary.test.mjs`: contract and real-binary acceptance; Cargo private-module tests pin actual parser invocations. No test argument or telemetry field is exposed through IPC.

## Task1: Strict refresh output and independently authored byte corpus

**Files:** Create C1 files/helper/test and `native-refresh-output-v3.ts`; modify Provider `index.ts`, package test script, root `package.json` test list and `.gitattributes` with `fixtures/ipc/refresh-v3/**/*.jsonl -text`. Existing full-only schema/client stays unchanged.

**Consumes:** Existing v3 request byte validator, state v1 digest/schema, Provider facts/refs, v2 coverage and NativeClient limits/errors.
**Produces:** Exact TypeScript exports/signature above, C1 manifest and `loadRefreshCase`/`chunkBytes` helper.

- [ ] Confirm approved plan/native method, applicable Handoff reading and B base. Check dirty worktree/attachments; use the worktree skill before execution, preserve unrelated changes. If B is still unmerged and no stacked-base authorization exists, stop this task before product edits.
- [ ] Author source-independent small byte cases with distinct retained/modified files and a retained-target edge upsert. Required valid cases: modify/delete, no-op, shared owner transfer, partial syntax and zero target files. Recompute only corpus framing hashes, not producer-derived semantic goldens. Wrong version/context/sequence/count/checksum/header/summary inventory/ownership, duplicate or conflicting operations, mixed full events, missing/extra SOURCE_FILE, malformed UTF-8/BOM/CR/blank/EOF/post-terminal and forged retained digest each have explicit rejection cases.
- [ ] Write named tests including `refresh coverage includes retained file without SOURCE_FILE`, `forged owner survives union but fails correspondence`, `empty scanner delta differs from inventory`, `slow sink is awaited`, and boundaries for input/line/total/events, Unicode/negative zero and requested memory-budget refusal. A valid corpus row uses assertions:

```js
const c = await loadRefreshCase('retained-caller-upsert');
const events = [];
const result = await api.decodeNativeRefreshV3(
  c.requestBytes,
  chunkBytes(c.eventBytes),
  {
    async accept(e) {
      events.push(e);
    },
  },
  api.NATIVE_CLIENT_HARD_LIMITS,
);
assert.equal(result.terminal.type, 'REFRESH_COMPLETED');
assert.equal(events.filter((e) => e.type === 'SOURCE_FILE').length, 1);
assert.equal(
  events.filter((e) => e.type === 'COVERAGE').length,
  c.targetFileCount * c.requestedCapabilityCount,
);
```

`loadRefreshCase` also returns `targetFileCount` and `requestedCapabilityCount` from the validated request; invalid rows use `assert.rejects` with the specified existing client error code. A blocked accept promise prevents requesting the next chunk; failure/EOF yields no success result.

- [ ] Run `node --test packages/providers/test/native-refresh-output-v3.test.mjs`; observe missing export/schema RED before implementation.
- [ ] Implement the strict union and decoder. Reuse payload schemas without weakening v1. Define required refresh completion counts locally (legacy completion is private), plus header/summary count. Validate exact added/modified SOURCE_FILE set, all target coverage/summaries and metadata≤1,000,000 bytes. Hold bounded identity/digest/ownership metadata, not a graph payload cache; account decoder/input/ordering copies before allocation under request budget. Verify replayed ledger equals target, upsert content digests match payloads, per-file ownership/source association and target node reference union are valid. Successful output checksum is `sha256:<hex>`; summary/request digests remain bare hex. Return frozen observation only after complete EOF/terminal validation.
- [ ] Rebuild Provider using `node node_modules/typescript/bin/tsc -b packages/providers --force`; run C1 tests plus existing `native-ipc.test.mjs`, `native-ipc-v2.test.mjs`, `native-ipc-v3.test.mjs`, `native-analysis-output-v3.test.mjs`. All manifest rows and named boundary assertions must pass. Record new exact-identity Runtime refusal as expected **pending Task5**, not a passing regression suite. Synchronize C1 trace/Fixture registration and commit only these task files and evidence.

## Task2: Retained decoding and shared fact recipes

**Files:** Create `retained.rs`; modify library `lib.rs`, `analyze.rs` private helpers and associated inline Rust tests. Do not alter Java resolver semantics, published fixtures or version constants.

**Consumes:** Summary v1, language structs, existing `DeclarationIndex` and canonical digest recipe.
**Produces:** `RetainedFile`/`decode_retained_file` above. Shared private helpers in `analyze.rs`: `symbol_payload(request:&Request,file:&Value,symbol:&SymbolFact)->Value`, `relation_payload(request:&Request,file:&Value,relation:ResolvedRelation)->Value`, `fact_content_digest(payload:&Value)->String`; full and refresh use identical helpers. Existing package/compilation-unit/coverage/summary helpers are reused, not rewritten.

- [ ] Write `retained_roundtrip_preserves_resolution_inputs`, `coverage_resolution_buckets_are_reset_not_added`, `forged_file_owner_rejected_even_with_same_union`, and `shared_container_all_owner_ledgers_match`. The roundtrip asserts equality of symbols/sites/diagnostics and extraction statistics with real Java extraction; unsupported/partial counts are retained, only resolution buckets reset for new resolution. Check usize conversion and memory-accounting overflow.
- [ ] Run `cargo test --workspace retained`; observe absent module/decoder RED. Implement strict checked decoding and the minimal shared payload/digest extraction, preserving existing JSON field values and identity recipes.
- [ ] Add internal `parse_source_observed<F:Fn(&str)+Sync>(root:&str,file:&Value,deadline:Instant,cancelled:&AtomicBool,with_relations:bool,on_parse:&F)->Result<LanguageAnalysis,ProcessingError>`; existing `parse_source` delegates with a no-op observer. Invoke callback immediately before the actual Java analyze call, after source verification; no callback/flag on wire. This permits Task3 private unit tests to count real parser invocations across worker threads without parsing counters being a product feature.
- [ ] Run `cargo test --workspace`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`; then build binary and run existing real `native-full-v3-binary.test.mjs`, `native-relations.test.mjs`, `native-coverage-v2.test.mjs`. All source/fact/checksum goldens must remain unchanged. Record tests and commit this independently testable retained/shared-helper unit.

## Task3: Baseline verification, target resolution and real REFRESH dispatch

**Files:** Create child `analyze/refresh.rs`; modify `analyze.rs` wrapper and `protocol.rs` valid-v3 REFRESH dispatch/related inline tests, plus the existing REFRESH-refusal assertion in `packages/providers/test/native-full-v3-binary.test.mjs`. Inline child tests own core parser/resource observations; reuse C1 contract/corpus.

**Consumes:** ValidatedRequestV3.header()/baseline(), Task2 retained decoding/shared recipes, existing worker/source/error machinery and Task1 output contract.
**Produces:** `run_refresh_v3` and child `run` signatures above. Child-private `run_observed<W:Write,F:Fn(&str)+Sync>(request:&ValidatedRequestV3,workers:NonZeroUsize,output:&mut W,on_parse:&F)->io::Result<ExitCode>` is the implementation seam; public run passes a no-op observer.

- [ ] Write `refresh_unknown_caller_resolves_without_parsing_caller`, `delete_only_parses_nothing`, `noop_parses_nothing`, `baseline_semantic_ledger_mismatch_refuses_before_parse`, `different_or_immutable_revision_refuses`, and complete-delta/refingerprint/resource tests. Core observer assertions:

```rust
assert_eq!(parsed_paths, vec!["src/Added.java"]);
assert!(events.iter().any(|e| e["type"] == "UPSERT_EDGE"));
assert_eq!(events.iter().filter(|e| e["type"] == "SOURCE_FILE").count(), 1);
```

`parsed_paths` comes from a Mutex-backed observer passed to `run_observed`; the test reads and sorts it after all workers join. The Fixture's unchanged caller and expected target ID are independently authored. Deletion/no-op tests assert an empty path list, not a fabricated performance percentage.

- [ ] Run `cargo test --workspace refresh`; observe current unavailable dispatch/missing child RED. Implement sequential baseline-index reconstruction and per-file/union digest-owner verification before diff. Release baseline index before target allocation; keep both lifetimes charged if overlap is unavoidable. Validate Native Java version context and same mutable WORKTREE; incompatible/mismatched retained data uses existing INVALID_REQUEST and parses no source.
- [ ] Implement changed extraction once per declared eligible changed file under existing worker/result/deadline caps; retain it only after charging storage. Drop deleted summaries, build complete target index, re-resolve every requested target relation site and regenerate complete coverage/diagnostics/summary ledgers. Zero old resolution buckets before counting, preserve extraction counts, syntax limitations and empty-success behavior. No unchanged parse fallback.
- [ ] Implement ledger diff: absent→remove, new/different digest→one upsert, equal→no operation. Verify per-file FILE/SHARED ownership; shared owner transfer alone emits no replacement. SOURCE_FILE is exactly add/modify set; diagnostics/coverage/summaries describe complete target. Emit deterministic ordering/header/count/checksum with bounded serialization. Preserve reserved terminal capacity and typed resource/deadline/parser/source failures; no success on omitted metadata.
- [ ] Route only validated v3 REFRESH through this producer; leave strict v1/v2 routing, full-v3 and DESCRIBE unchanged. Existing protocol/full-binary tests name `valid-empty-refresh.jsonl` as unavailable; inspect its schema-only context/resource values and retain their appropriate incompatible-producer refusal assertions under accurate names. Add a distinct current-context/admissible-budget real empty REFRESH success case; do not mutate old request byte Fixtures or delete negative coverage. Full-only decoder must still reject patch events. Run core Rust tests and C1 tests against actual output; commit producer with fresh evidence, explicitly not Runtime publication or parent completion.

## Task4: Registered real-binary transition and failure evidence

**Files:** Create C2 Fixture, expectations and real binary suite above; extend C1 index with its exact binary-suite/Fixture references; root `test:native-analysis` must include the new binary suite. Use existing CI entrypoints; no new job/dependency is needed. Extend Cargo private producer tests where observations require hooks; no public test mode.

**Consumes:** Task1 decoder and Task3 real binary; current Evaluation Fixture registry, Canonical normalizer and registered Java examples.
**Produces:** Registered source-grounded transition corpus and required runner evidence. Test-only `replayRefreshFacts(baselineNodes,baselineEdges,events)` lives in the new binary suite and returns complete Provider node/edge arrays sorted by identity. It omits only superseded snapshot identity for semantic comparison, not resolution/source/uncertainty fields. Test-only `toNormalizationResult(fullRequestV3,targetNodes,targetEdges,targetCoverage,targetDiagnostics)` returns an existing `ValidatedNativeResult` v2 full-observation shape: strictly reconstruct request/events/counts/checksum, retag cloned facts to that observation's snapshot and validate v2 schema. Neither helper is exported product code or changes stored history; never feed a mixed-snapshot patch directly to the full-only normalizer.

- [ ] Author exact source snapshots and transition expectations for modify call target; add/delete class/method; same-arity overload ambiguity; import/inheritance change; unknown→resolved and resolved→unknown/ambiguous; shared container nonlast/last owner and first-owner deletion. Include metadata-only source change, duplicate hints, repeated refresh after fresh-process restart, zero/no-op/deletion-only and syntax partial/unsupported regions. Expected targets/resolution categories and exact changed source set are hand-derived before producer runs.
- [ ] Write binary assertions with shell-free bounded spawn/timeout/stdout/stderr handling modeled on existing full-v3 binary tests. Build the baseline with real full ANALYZE; launch REFRESH in a **new process**, then full ANALYZE of target in another. Validate both streams; replay the patch, compare complete target Provider facts/coverage/summaries, and normalize complete replay/full observations with the existing normalizer for task-local Canonical comparison. Preserve explicit PARTIAL rejection at normalization/publication boundaries. Do not compare Evidence/snapshot history across a rebuild as if it were stable identity.
- [ ] Run new tests before supplying each behavior/Fixture correction; capture the genuine RED assertion, then implement only its owning missing behavior. Correct source/expectation defects with evidence, not producer-generated replacement goldens. Register C2 via discoverFixtures and assert exact manifest ID plus suite references; root/package mandatory runner registration tests must prove no Fixture is orphaned.
- [ ] Pin parser counts in Rust observer tests for every changed/deleted/no-op/restart case, and force alternate worker completion orders privately; compare normalized graph/coverage/summary semantics across admissible worker counts. Real process tests use existing `--parse-workers`; no new worker default/count policy.
- [ ] Add changed-byte drift, source read failure, unsupported language/capability, parser exception (private seam), expired deadline during retained reconstruction/resolution, insufficient memory, input/output/metadata/event limits, partial write/error, child cancellation and slow stdout drain. Assert no successful terminal/decoder result on failure, no post-terminal bytes accepted and protocol/log separation. A deliberately blocked Rust writer tests backpressure without production memory/latency claims.
- [ ] Run `node --test --test-concurrency=1 packages/providers/test/native-refresh-output-v3.test.mjs packages/providers/test/native-refresh-v3-binary.test.mjs`, Cargo tests and registry/architecture tests. All declared C cases pass with unchanged Java source checkout and old byte goldens. Record actual counts/commands and remaining D/E links; commit this tested corpus/runner unit.

## Task5: Exact-build compatibility calibration and approval hold

**Files:** New immutable `fixtures/storage/native-analysis-state/memory-refresh-c-{read-seal,transport,evidence,candidate,holdout}.json`; exact `-text` attributes. After numeric approval only, add new static profile in `packages/runtime/src/native-metadata-profiles.ts` and focused provenance/budget assertions in existing admission/read tests and `scripts/test-native-memory-profile.mjs`. Never change admission algorithm, old profile/report bytes, corpus definitions or existing thresholds.

**Consumes:** Final C Node build, existing accepted high-water/range policy and unchanged calibration/collector scripts.
**Produces:** Real paired READ_SEAL/FULL_TRANSPORT compatibility evidence and, only after explicit exact numeric approval, an admitted profile for those existing purposes. It produces **no REFRESH transport profile**.

- [ ] Force complete workspace build, call actual `nativeMetadataEnvironment()` and prove the former static profile refuses the new identity. Freeze source/built identity before capture; any subsequent measured JS change invalidates candidate and requires governed remeasurement, not edited environment metadata.
- [ ] Run sequentially `node scripts/bench-native-metadata-memory.mjs` and `node scripts/bench-native-full-v3-memory.mjs`; preserve raw stdout bytes under the two new report names. Existing scripts define five repetitions and65/70 observations; require actual environment/corpus/class correctness, all snapshots/transactions validated and no concurrent heavy suite. Keep failures as evidence.
- [ ] Author new exact-identity manifest with real report hashes/corpus identities. Include all compatible captured history; for a genuinely new identity use an empty priorApprovals list unless an actual same-identity approval exists. Run `node scripts/native-memory-profile.mjs candidate fixtures/storage/native-analysis-state/memory-refresh-c-evidence.json fixtures/storage/native-analysis-state`, preserve candidate bytes and independently recompute M/J/floor under the unchanged accepted policy.
- [ ] Run `node scripts/native-memory-observations.mjs candidate .superpowers/sdd/2026-10-03-p05-w3-020-native-refresh-producer/holdout fixtures/storage/native-analysis-state/memory-refresh-c-candidate.json`; preserve its complete raw artifact as new holdout. Require27 fresh observations/zero failures and pinned candidate/report hashes. Failed holdout remains a hold, never a retry-until-green or automatic margin update.
- [ ] **STOP for the user's exact numeric approval.** Present identity, M/J/floor, exact reservation plus twice retained SQL UTF-8, report/manifest/candidate/holdout hashes and finite-sampling limitations. Plan approval is not numeric approval; no value is preselected here.
- [ ] After approval, write absent-profile RED provenance/equality/one-byte-below tests, install only the approved static profile and rebuild. Profile JS is excluded from identity, so verify digest unchanged. Run original required memory suites and approved collector; every class/peak gate must pass. If fresh evidence exceeds approved reservation, stop with failure artifacts and governed amendment rather than weaken gates. Commit approved profile/evidence and status only after green required verification.

## Task6: Complete regression, one branch review and handoff

**Files:** Existing Handoff Current Status/Traceability/Native IPC/Provider SPI/Work Breakdown/Acceptance/Roadmap plus C spec/plan execution records. Update architecture/deferred/authority only if needed; no original phase checkbox or threshold changes.

**Consumes:** Tasks1–5 green evidence and approved profile. **Produces:** Completed packet C record with reproducible commands/Fixture IDs, actual limitations and next D written-design boundary; not a completed parent.

- [ ] Run registered `pnpm verify` when available. If its known no-TTY pre-gate guard prevents execution, record failure and run each exact registered constituent separately, with sequential16-project build/IR types/root tests/architecture17, full real Native suites including C, client/handshake, Rust fmt/build/Clippy/tests, original required memory suites and approved collector. Do not replace root suite with focused tests or claim wrapper success.
- [ ] Run fresh required memory checks with `CODEATLAS_REQUIRE_NATIVE_MEMORY_PROFILE=1` and plan-owned artifact directory; preserve failure-inclusive outputs. Run `pnpm format:check` plus explicit C docs formatting (normally ignored), git diff check and local Markdown-link checks. Old byte corpora, migrations and historical profile/raw reports must have an empty diff.
- [ ] Update CURRENT_STATUS with exact build/commit/commands/pass counts, C1/C2 registration, parser counts/worker consistency, memory identities and pending D/E trace links. Clearly distinguish task-local Provider/Canonical comparison from persisted Evaluation, local evidence from hosted results, and observed PARTIAL from applicable state. DESCRIBE incremental remains unadvertised.
- [ ] For preserved native execution, invoke requesting-code-review once for the whole scoped branch on the skill-required most capable reviewer, after all gates. Follow its repair budget and receiving-review verification; do not spin unbounded review loops or silently ignore Important findings. Review includes explicit ownership, unresolved-site, no-unchanged-parse and original-profile compatibility gates.
- [ ] Commit only named task/evidence files. Use finishing-a-development-branch workflow to present integration choices; push/create/merge only with applicable user authority and confirm exact-head CI separately. Local C completion does not authorize merging PR#18, changing main or starting D code. Preserve diagnostic backups/artifacts needed by evidence.

## Self-review and execution handoff

Spec coverage: strict output/framing/ledger→Task1; retained inputs/full recipe compatibility→Task2; changed parsing/complete index/sites/ownership diff→Task3; restart/source-based expectations/differential/resource/worker→Task4; changed exact-build original-purpose admission→Task5; complete regression/traceability/review→Task6. Every Review Focus item has named tests; no undefined cross-task product interface or new numeric threshold is prescribed. Fixture paths are future artifacts, not passing evidence.

The original accepted design's conditional exact-identity regression gate is now known to be mandatory because admission hashes all built Provider JS. Task5 makes that compatibility work explicit without importing D's refresh workflow. The written C spec remains unchanged in behavior/scope; no new ADR is proposed. A Fixture exposing insufficient summaries or incompatible resolver/digest behavior pauses implementation for governed amendment.

All checkboxes remain open: only planning has occurred. Await review of this plan, then preserve native execution through executing-plans. Separate B-base confirmation and Task5 numeric approval are real holds, not extra scope or presumed authority.
