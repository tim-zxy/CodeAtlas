# Multi Language Native Analyzer and Scalability

Status: backward-compatible architecture extension. Authority: [ADR-014](../handoff/adr/ADR-014-multilanguage-native-analyzer.md). Java is the first planned analyzer language, not an architectural binding; the Rust executable currently implements DESCRIBE and smoke handling, not Java analysis. This specification governs future NativeProvider internals without changing Canonical IR or the external Provider SPI.

## Internal boundaries

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

Represent outcomes without treating an empty fact list as an error: timeout/budget exhaustion, parser exception, unsupported language or capability, syntax-error/partial coverage, and successful analysis with zero facts are distinct. Use existing IPC error, diagnostic, capability-coverage, and terminal-outcome channels where they can express the distinction. A new wire field or persisted ProviderSnapshot field requires a separately reviewed version/compatibility decision. Syntax errors retain source/coverage evidence; they do not become invented resolved relations. A failed terminal never activates state.

Parallel parse completion order must not change Provider Fact identity, normalized Canonical Graph semantics, coverage, or stale-fact removal. A Worker Consistency Fixture runs the same pinned input with distinct effective worker counts and completion orders, then compares the normalized result and active-state outcome. Stable wire ordering is required where IPC v1 requires it; otherwise normalization, not arrival order, determines graph semantics.

## Measurement and benchmarks

Record, at minimum, `scan_ms`, `parse_ms`, `resolve_ms`, `ipc_ms`, `normalize_ms`, `db_apply_ms`, `total_ms`, and `peak_memory` for each run, together with language, capability, file count, changed-file count, repository fingerprint, grammar/analyzer/compatibility versions, worker count, environment, and success/coverage status. Timings are durations in milliseconds; `peak_memory` includes units and collection method. Stage times may overlap under streaming/parallelism, so `total_ms` is independently measured rather than assumed to equal their sum.

The benchmark suite has Cold Index, 1-file Incremental, Small-batch (pinned 5-file), Large-batch (pinned 50-file), and Worker Consistency scenarios. Each scenario reports median and tail latency, memory, throughput, correctness versus a full rebuild, and stale-fact count on a pinned fixture/repository. Record scan, parse, resolve, IPC, normalize, DB apply, total, and peak-memory stages even if a stage is unavailable, with an explicit unavailable reason rather than a fabricated zero. No numeric latency threshold is invented in this amendment; thresholds are EVOLVABLE and must be set from baseline measurements before becoming a phase gate. The existing Phase 0.5 correctness gates still apply.

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
