# Multi Language Native Analyzer and Scalability

2026-10-03 C1A checkpoint under confirmed native plan8fb12a6: private trusted-budget/lazy preparation precedes pure bounded verification; wire/work charging is not RSS accounting. Separate REFRESH_VERIFY static profile is empty; final-build independent corpus/calibration/numeric review/actual-port checks remain4A/5/1B/4B. Required original-purpose root27 failures are retained (CURRENT_STATUS). No Rust worker change, D transport budget, adaptive scheduling, new threshold/language/framework or phase promotion is introduced.

Final local packet B evidence (2026-10-02): approved280,453,120-byte exact profile plus twice retained SQL UTF-8 passes complete equivalent root/native/Rust/admission/corpus/collector gates in CURRENT_STATUS. Both Important review corrections are closed in one pass; no new reviewer/hosted result. Static offline-policy provenance does not introduce adaptive scheduling, new thresholds or language/framework scope. Parent REFRESH and phase gates remain open at10/14 integrated. This supersedes final-gates-pending wording below; raw evidence and historical profiles remain unchanged.

Task4 approval update (2026-10-02): the user explicitly approves280,453,120 bytes plus twice retained SQL UTF-8 for the frozen exact86fa33c5 candidate. Matching static profile installation follows absent-profile RED, preserving historical entries; Runtime51/51 and required corpus41/41 pass, final root/native/Rust/collector gates remain pending. This supersedes numeric-review-pending text below. Offline range policy is finite measured evidence, not an OS RSS bound, adaptive worker policy or phase performance threshold.

Current packet B admission hold (2026-10-02): the accepted offline stability policy and reviewed native plan produced a provisional280,453,120-byte candidate, including complete compatible history, plus an independent27-class holdout. Exact numerical approval and final Runtime gates remain mandatory before installation; the corrected build currently fails closed. See CURRENT_STATUS for matching identity and immutable evidence. This supersedes historical prior-build admission statements below without changing language/plugin boundaries, worker scheduling, retained-SQL charge, IPC limits or phase scope.

Task 6 admission update (2026-10-02): the explicitly approved repaired-build Windows profile reserves 247,508,992 bytes plus twice retained SQL UTF-8 bytes. Both immutable paired raw reports, exact environment/build/corpus identities and reproduction commands are recorded in CURRENT_STATUS. Missing/changed profiles and matching read-only evidence still refuse full transport before observation. This is not a hard RSS guarantee, Linux profile, new worker mode or Phase 0.5 performance gate.

Status: backward-compatible architecture extension. Authority: [ADR-014](../handoff/adr/ADR-014-multilanguage-native-analyzer.md). Java is the first implemented analyzer language, not an architectural binding; the Rust executable supports existing DESCRIBE and v1/v2 Java ANALYZE. v3 input validators are isolated and are not an advertised or dispatched REFRESH capability. This specification governs future NativeProvider internals without changing Canonical IR or the external Provider SPI.

## Internal boundaries

[ADR-016](../handoff/adr/ADR-016-native-refresh-derived-analysis-state.md) accepts negotiated Native v3 and TypeScript-owned derived per-file summaries for restart-safe reconstruction, without persistent ASTs or Rust SQLite access. The initial implementation may scan/re-resolve compatible retained relation sites under existing budgets rather than add a speculative optimized dependency index; unchanged source parsing is not a substitute. Shared ownership and ambiguous/unresolved sites must survive invalidation. Hard byte/event caps remain unchanged, and exceeding them is explicit failure, not an automatic full reparse. The [first detailed contract packet](../superpowers/specs/2026-09-30-p05-w3-020-v3-contract-design.md) was approved and its bounded input validators/shared contract corpus are local; no v3 runtime capability or performance result exists yet. Earlier executable-state descriptions in this document are historical; CURRENT_STATUS and actual code determine implemented capabilities.

NativeProvider selects a `LanguageAnalyzer` by language and grammar capability. Each language adapter independently implements Symbol, Import, Reference, Call, Inheritance, and Override extraction or reports a fixture-backed `UNSUPPORTED`/`PARTIAL` capability. An adapter may reuse core utilities, but the Java AST visitor/resolver must not become the NativeProvider main flow.

```ts
interface LanguageDescriptor {
  languageId: string;
  grammarVersion: string;
  analyzerVersion: string;
  analysisCompatibilityId: string;
  capabilities: LanguageCapability[];
}

interface LanguageAnalyzer {
  describe(): LanguageDescriptor;
  extract(files: ChangedFileSet, context: AnalysisContext): AsyncIterable<ProviderFact>;
  resolve(facts: ProviderFactIndex, context: AnalysisContext): AsyncIterable<ProviderFact>;
}
```

This is a conceptual SPI; the Rust implementation chooses concrete traits and lifetimes. Capability registration uses the `LanguageDescriptor`, while the future NativeProvider emits Provider Facts through versioned IPC. `grammarVersion`, `analyzerVersion`, and `analysisCompatibilityId` belong in a versioned provider-side LanguageDescriptor and negotiated IPC metadata. The current strict `ProviderSnapshot` v1 has no extension field, so these values must not be inserted into it. Any future persisted snapshot metadata requires a separately reviewed compatible schema/version and storage change. A changed compatibility ID invalidates only affected provider facts/snapshots through the normal validated re-analysis path; it does not silently mutate Knowledge.

Framework-specific semantics belong to Plugin implementations. The Java parser never interprets Spring business semantics; a Python parser never interprets FastAPI business semantics. Language analyzers may expose syntax and symbol evidence (for example an annotation or decorator reference), but route, dependency, task, and domain meaning are resolved by the Plugin layer. The provider cannot write SQLite.

## Recommended components and flow

```text
core parser runtime
  -> language adapters
  -> repository resolver
  -> fact emitter

Parse & Extract -> Index & Resolve -> Emit
```

The core runtime owns scheduling, fingerprints, parser pooling, cancellation, budgets, and metrics. Language adapters own grammar queries/visitors and language-level resolution. The repository resolver builds bounded per-repository symbol indexes and cross-file candidate sets without introducing framework meaning. The fact emitter validates and streams Provider Facts, coverage, diagnostics, and terminal events as JSONL. TypeScript normalizes provider facts, stages a complete batch/patch, and activates it through a SQLite batch transaction only after validation.

## Incremental and performance policy

- Use Rust and Tree-sitter for parsing. Keep one parser instance per worker/thread; do not share a mutable parser across threads.
- Fingerprint files and detect additions, modifications, and deletions before parsing. A full index parses all eligible files; refresh parses only changed files and the smallest resolver-dependent set required for correctness.
- While the runtime remains alive, retain eligible Tree-sitter trees in a bounded memory cache and use incremental tree edits for changed files when an edit sequence is available. Cache eviction falls back to parsing that changed file, not the entire repository.
- After runtime restart, persisted fingerprints and provider metadata identify changed files; only changed files are reparsed. ASTs are not persisted. Repository-level symbol indexes may be rebuilt from persisted provider/canonical facts where valid; compatibility-ID changes trigger targeted invalidation.
- Parse multiple files concurrently with bounded workers and memory/backpressure. Preserve deterministic emitted identity and ordering where the protocol requires it.
- Emit JSONL incrementally with stdout reserved exclusively for protocol records; diagnostics/logs use stderr. Validate terminal integrity before applying state.
- Apply a staged analysis or patch through batched parameterized SQL in a single activation transaction. Never open one SQLite transaction per node or edge. Failure leaves the previous active graph available.
- Bound parser/IPC queues, line/event sizes, worker count, memory, and cancellation latency; record partial coverage rather than inventing resolved facts under budget pressure.

### Phase 0.5 scheduling and outcome contract

The one worker-count input is `EffectiveConfig.indexing.nativeAnalyzer.parseWorkers` and is passed to the native analysis coordinator. Its value is `AUTO` or an explicit positive safe integer. `AUTO` derives a safe effective count from available execution resources and the configured request memory budget; an explicit value is still constrained by that budget, with an impossible request rejected rather than silently changed. Record both requested mode and effective count. Do not introduce a second CLI-only or Rust-only knob or add a strict IPC v1 field merely for this setting. Concrete default and budget limits are selected from pinned benchmark evidence, not copied from another analyzer.

Bound pending files, in-flight parses, completed-but-unconsumed results, and native-to-TypeScript events by the effective memory/resource budget. When the downstream JSONL reader, normalizer, or staging writer cannot accept more work, apply backpressure upstream rather than retaining an unbounded result set. The existing Phase 0 client intentionally buffers a validated response under hard byte/event ceilings; it proves protocol integrity, not the Phase 0.5 large-repository streaming-to-staging path. Do not raise those ceilings as a substitute for bounded staging and apply.

For P05-W3-001, the process-local Java SYMBOL path uses a 16 MiB accounted reservation per requested parse worker: at most 64 KiB raw source bytes and at most 4 MiB estimated retained symbol-result allocations (including the identity map), leaving the rest for parser/tree and transient work. The source admission cap is applied before Tree-sitter constructs an AST; the symbol estimate is checked during collection. These are conservative policy limits, not allocator-enforced or OS hard-memory limits. On 2026-09-25, five Windows x86-64 MSVC debug runs per pinned Fixture, sampled through `System.Diagnostics.Process.PeakWorkingSet64` while asynchronously draining stdout/stderr, observed basic peaks of 5.51/2.98/2.55/2.62/2.55 MiB and nested peaks of 2.14/2.80/2.98/2.98/2.98 MiB.

A reproducible dense-source benchmark (`scripts/bench-native-symbol-memory.ps1`) then measured 9,000 unique fields (97,904 source bytes) at 17,932,288 peak working-set bytes even though the result cap rejected it; 9,000 short fields (63,014 source bytes) peaked at 14,708,736 bytes and were also rejected by the result cap. The 64 KiB source cap is below the observed over-budget case; additional runs at 64,904-byte unique fields, 30,024-byte nested parentheses, and 30,014-byte empty declarations peaked at 13,758,464, 11,726,848, and 9,244,672 working-set bytes respectively. These Windows stress samples justify the current provisional admission band but do not prove a hard RSS bound for every Java syntax shape or Linux. Later resource Evaluation must revise the policy using broader pinned input and Linux evidence; files above the provisional cap receive a typed resource failure rather than being silently skipped. The coordinator parses batches of no more than the effective worker count and drains each batch in source-file order before scheduling another, so completed results cannot accumulate beyond one batch. A timed batch wait and parser progress cancellation prevent a slow worker from holding protocol completion past the requested deadline; a blocking filesystem read is checked immediately after it returns, and the one-shot TypeScript client separately kills the process on its timeout. The control plane resolves `AUTO` or a validated explicit count against the same reservation; Rust rechecks the requested process-local count against the request memory budget. No IPC field or second user-facing worker setting is added.

Represent outcomes without treating an empty fact list as an error: timeout/budget exhaustion, parser exception, unsupported language or capability, syntax-error/partial coverage, and successful analysis with zero facts are distinct. Use existing IPC error, diagnostic, capability-coverage, and terminal-outcome channels where they can express the distinction. A new wire field or persisted ProviderSnapshot field requires a separately reviewed version/compatibility decision. Syntax errors retain source/coverage evidence; they do not become invented resolved relations. A failed terminal never activates state.

ADR-015 supplies that compatibility decision for P05-W3-003: negotiated protocol-v2 `ANALYZE` adds exact recognized-site coverage and relation-resolution counts per file/capability, while v1 remains strict and reports numeric statistics as unavailable. Unknown syntax-error regions are not assigned a fabricated denominator. IR schema and persisted ProviderSnapshot remain at version 1; protocol-v2 `REFRESH` is not authorized by this task. The original phase accuracy gates and evidence-driven performance policy remain unchanged.

Parallel parse completion order must not change Provider Fact identity, normalized Canonical Graph semantics, coverage, or stale-fact removal. A Worker Consistency Fixture runs the same pinned input with distinct effective worker counts and completion orders, then compares the normalized result and active-state outcome. Stable wire ordering is required where IPC v1 requires it; otherwise normalization, not arrival order, determines graph semantics.

## Measurement and benchmarks

Record, at minimum, `scan_ms`, `parse_ms`, `resolve_ms`, `ipc_ms`, `normalize_ms`, `db_apply_ms`, `total_ms`, and `peak_memory` for each run, together with language, capability, file count, changed-file count, repository fingerprint, grammar/analyzer/compatibility versions, worker count, environment, and success/coverage status. Timings are durations in milliseconds; `peak_memory` includes units and collection method. Stage times may overlap under streaming/parallelism, so `total_ms` is independently measured rather than assumed to equal their sum.

The benchmark suite has Cold Index, 1-file Incremental, Small-batch (pinned 5-file), Large-batch (pinned 50-file), and Worker Consistency scenarios. Each scenario reports median and tail latency, memory, throughput, correctness versus a full rebuild, and stale-fact count on a pinned fixture/repository. Record scan, parse, resolve, IPC, normalize, DB apply, total, and peak-memory stages even if a stage is unavailable, with an explicit unavailable reason rather than a fabricated zero. No numeric latency threshold is invented in this amendment; thresholds are EVOLVABLE and must be set from baseline measurements before becoming a phase gate. The existing Phase 0.5 correctness gates still apply.

### Approved Node metadata admission baseline

Task 3's current built identity no longer matches the Task 2 profile below. The unchanged read/seal runner has produced a new 65-observation proposal of 250,855,424 bytes plus twice retained SQL UTF-8 bytes, pending explicit numeric review; CURRENT_STATUS records the exact identity and retained raw report. The old approved profile remains unchanged and current production admission fails closed. Loading the new modules during read/seal does not measure execution of the new decoder/process transport: Task 4 must calibrate that actual workspace before claiming admission. This note does not approve a reservation or change a phase gate.

Task 3 numeric approval update (2026-10-01): the user answered the exact reservation question with “继续”. The unaltered report is preserved separately at `fixtures/storage/native-analysis-state/memory-baseline-task3.json`, SHA-256 `a9451c810ae270340cb499cac5dbf01d0fe274b755861a6725b4576eb17815b1`, with capture status unchanged. The current-build Windows read/seal profile now reserves 250,855,424 bytes plus twice retained SQL UTF-8 bytes; Task 2 report/profile is unchanged. Production matching-profile and one-byte-below/refusal checks passed within 83/83 focused tests after explicit RED for the absent current profile. Earlier pending-review/current-build refusal wording is historical and superseded by this approval/install record. Final post-approval root Node regression passes 762 with one existing Windows skip; focused tests pass 83/83, Cargo 88/88, existing real Native tests 25/25, build/type/architecture/fmt/Clippy/format/diff pass. Local Task 3 local Task 3 is complete. Decoder/transport workspace admission is still Task 4 work; no real producer/bootstrap/REFRESH or phase exit is claimed.

Task 4 paired measurement (2026-10-01): exact Node `v24.15.0` / V8 `13.6.233.17-node.48` / win32/x64 / Zod `4.6.1`, built identity `91931ccddf3b3eae0687e07cae23b9da14901976596811f178cf2f1b7bf8f09c`. Read/seal: 13 classes × five fresh processes = 65 observations, absolute peak **247,132,160 bytes**; full transport: 14 classes × five = 70 observations, absolute peak **196,911,104 bytes**. Proposal: the larger **247,132,160 bytes (235.68359375 MiB) plus twice actual retained SQL UTF-8 bytes**. The original capture status of both raw reports is retained; the subsequent approval/installation record below supersedes the pre-approval proposal. Earlier Task 2/3 profiles are preserved. This is Node workspace evidence using a checksum-verifying test child, not real Rust v3 production, a hard RSS bound, Linux evidence or a phase performance gate.

Task 4 numeric approval (2026-10-01): the user explicitly approved **247,132,160 bytes plus twice actual retained SQL UTF-8 bytes**. The paired raw reports are preserved unchanged at `fixtures/storage/native-analysis-state/memory-baseline-task4-read-seal.json` (SHA-256 `9dca28c23dd8fed77d22374505123b0984a782c700b6590838cee4ce4858e262`, 65 observations) and `memory-baseline-task4-transport.json` (SHA-256 `b7154f67fd8cbcf459eacbcd7405e3788dd9a47ef2bbdf2803390ce778dcda65`, 70 observations); original capture status remains `PROVISIONAL_REVIEW_REQUIRED`, with subsequent approval recorded here. Install only the matching Node/V8/win32/x64/Zod/built identity `91931ccddf3b3eae0687e07cae23b9da14901976596811f178cf2f1b7bf8f09c`, with full-transport corpus/evidence digests and measured transport peak 196,911,104 bytes. Task 2/3 raw reports/profiles remain unchanged. Missing/mismatched environments still fail closed. The profile-data module is excluded from implementation hashing, so installation changes no measured implementation. This is not real Rust v3 producer/bootstrap, hosted/Linux evidence, a hard RSS guarantee or a phase performance threshold.

The transport corpus adds near-ceiling input and slow-sink workspace to the existing applicable UTF-8/numeric/owner/invalid-output classes; SQL-column read refusal remains in the separate read/seal corpus. Runtime-owned purpose admission requires reviewed full-transport corpus/evidence digests and peak within the reviewed reservation before Task 6 invokes the Provider observer. CURRENT_STATUS records both reproducible runners and exact raw report digests.

P05-W3-020-B Task 2 uses a separate Node baseline, not the Rust worker reservation. On 2026-10-01 the user approved thirteen actual read/full-stage-seal classes with five fresh-process measurements each: [raw report](../../fixtures/storage/native-analysis-state/memory-baseline.json), SHA-256 `cd69ea2b526a4e70a11f67402924ee1757a0d5eaf26081c3b848ec747c89b386`. The exact internal profile requires Node `v24.15.0`, V8 `13.6.233.17-node.48`, Windows x64, Zod `4.6.1` and built implementation digest `e9fc7784930fe3346c0d0390731c290755242c159f09656404394d811e5c8298`. Admission reserves **250,183,680 bytes plus twice actual retained SQL UTF-8 string bytes** before Provider decoding. SQL numeric preflight precedes Node string retention; missing/mismatched profiles fail closed. Raw capture status is preserved, with subsequent approval recorded in CURRENT_STATUS and the accepted packet design. This is conservative measured admission, not an OS hard RSS bound, Linux evidence or a phase-wide performance threshold. Changes to the measured path require remeasurement/review; required hosted-platform evidence remains open.

## Multi language capability matrix

The matrix is versioned evaluation output, not a marketing declaration. Each cell stores maturity (`UNSUPPORTED`, `EXPERIMENTAL`, `EVALUATED`, or `STABLE`), fixture-set ID, precision/recall or exactness metric, coverage, analyzer/grammar/compatibility versions, and evaluation run reference. `STABLE` requires the approved capability threshold on a frozen fixture set; a hand-written descriptor alone cannot upgrade maturity.

| Language       | Symbol             | Import             | Reference          | Call               | Inheritance        | Override           | Initial commitment                                       |
| -------------- | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ | -------------------------------------------------------- |
| Java           | Fixture-derived    | Fixture-derived    | Fixture-derived    | Fixture-derived    | Fixture-derived    | Fixture-derived    | First implementation in Phase 0.5                        |
| Python         | Not yet registered | Not yet registered | Not yet registered | Not yet registered | Not yet registered | Not yet registered | Future onboarding; FastAPI semantics remain Plugin-owned |
| Other language | Not yet registered | Not yet registered | Not yet registered | Not yet registered | Not yet registered | Not yet registered | No commitment until fixtures and evaluation              |

`Fixture-derived` does not assert that code or evaluation currently exists. Before Phase 0.5 implementation, Java maturity is unproven. Missing fixture evidence leaves the capability unregistered or `EXPERIMENTAL`, never `STABLE`.

Future language onboarding is: `grammar -> LanguageAnalyzer -> Provider Facts -> Fixtures -> Evaluation -> Capability registration`. Each step must verify protocol and Canonical IR compatibility, unresolved/partial behavior, incremental invalidation, and framework separation.

## Phase allocation

- Phase 0: keep IPC/Provider descriptors language-capable and stderr/stdout separation; no parser or benchmark target is required.
- Phase 0.5: implement the Java adapter behind the LanguageAnalyzer boundary, file-level refresh, staging/batch apply, coverage, and metric capture. Do not expand language scope or alter numerical quality gates.
- Phase 1: add framework Plugins and any additional language only if its own fixtures and evaluation justify registration. The phase does not require every language at once.
- Phase 2/3: tune multi-language concurrency, capability-aware routing, and optional `FAST`, `BALANCED`, `PRECISE` analysis-depth profiles using measured quality/latency trade-offs. These are depth/routing profiles, not different Canonical IR schemas. Adaptive policy and advanced analyzers remain deferred to the appropriate phase.
