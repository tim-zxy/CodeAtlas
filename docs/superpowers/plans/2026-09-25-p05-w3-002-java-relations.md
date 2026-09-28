# P05-W3-002 Java Relations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit deterministic, source-grounded Java import, call, inheritance, and initial reference ProviderEdges through Native IPC v1, preserving ambiguity and unresolved targets.

**Architecture:** Keep Java syntax collection and name resolution in the Rust language layer. A bounded first pass indexes declarations from the verified request inventory; a second verified pass emits symbols and resolved or non-resolved relation sites in source order. Existing TypeScript Native IPC validates complete JSONL; task-local Fixture checks measure the already-approved direct-call gates without changing the Phase 0 evaluator.

**Tech Stack:** Rust 1.98.1, Tree-sitter 0.27.0/Java 0.23.5, `serde_json`, SHA-256, Node 24, TypeScript Native IPC/IR schemas, Evaluation manifest v1, Cargo/Node tests.

**Spec:** [Approved P05-W3-002 design](../specs/2026-09-25-p05-w3-002-java-relations-design.md)

## Global Constraints

- Start from `a9180d8201db80590ceae634e39fa8d501fbc0ea` on the existing linked worktree branch `codex/p05-w3-002-java-relations`; preserve unrelated user changes. Re-read Handoff authorities listed in the spec before product edits.
- Preserve Provider-independent Canonical IR, strict Native IPC v1, existing SQLite schema, old exact SYMBOL-only goldens, source safety, and the single validated `parseWorkers` input. Rust never writes Canonical SQLite or interprets framework semantics.
- Keep each pass within the request deadline and `maxMemoryBytes`; retain no repository-wide AST or unbounded relation-result queue. Preserve the existing 64 KiB pre-parse source cap and 4 MiB estimated per-worker result cap unless pinned Evaluation evidence governs a change.
- Do not claim Phase 0.5 exit. REFRESH, full outcome statistics, Canonical normalization/apply, full Worker Consistency, and performance baselines retain their assigned later tasks.
- Direct-call precision remains at least 95 percent and recall at least 90 percent. Do not add unsupported `callPrecision` or `callRecall` to the six-gate Phase 0 CLI, lower a threshold, or treat an ambiguous target as resolved.
- Use RED→GREEN tests and focused commits; before task acceptance, record exact Fixture/gate commands and implementation SHA in `CURRENT_STATUS.md` and concrete paths in `DESIGN_TRACEABILITY.md`.

## Review Focus

1. A default-package file imports a type but declares no package: Task 2 gives its import a file-scoped `java.compilation_unit` source, not a fabricated package node.
2. Two overloads have the same name and arity with insufficient argument-type evidence: Task 3 emits `AMBIGUOUS` with two stable candidates, never a chosen target.
3. A source file changes between index and emission passes, including a same-length edit: Task 4 ends `ANALYSIS_FAILED` with `SOURCE_CHANGED`; no successful stream is exposed.
4. A cross-file target appears in a later-scheduled file or workers finish out of order: Tasks 3 and 4 produce the same ordered relation payloads at worker counts 1 and 2.
5. The declaration index, event count, or JSONL byte budget is exhausted: Task 4 emits an existing typed resource failure terminal, never an incomplete success or silent omission.

---

## File map and interface lock

| Path | One responsibility |
| --- | --- |
| `crates/native-analyzer/src/language.rs` | Internal relation-site/target result types; keep public Provider/IPC contracts unchanged. |
| `crates/native-analyzer/src/java.rs` | Reuse the existing parser/symbol collector and expose a second-pass Java analysis entry point. |
| `crates/native-analyzer/src/java_relations.rs` | Tree-sitter Java site visitor for imports, calls, inheritance, and references; no framework semantics. |
| `crates/native-analyzer/src/relation_index.rs` | Bounded repository declaration index and candidate selection/resolution. |
| `crates/native-analyzer/src/lib.rs` | Register the two Rust modules. |
| `crates/native-analyzer/src/analyze.rs` | Two-pass coordinator, request capability routing, budgeted IPC EDGE/COVERAGE emission and counts. |
| `crates/native-analyzer/src/protocol.rs` | DESCRIBE capability advertisement only after real Fixtures pass. |
| `crates/native-analyzer/tests/java_relations.rs`, `tests/analyze.rs`, `tests/handshake.rs` | Adapter/resolver, process/failure, and descriptor tests. |
| `fixtures/native/{java-call-basic,java-overload,java-inheritance,java-unresolved-call}/` | Registered source inputs and exact nodes/edges/coverage/diagnostic goldens. |
| `packages/providers/test/native-analysis.test.mjs` | Keep the two prior SYMBOL Fixtures selected explicitly. |
| `packages/providers/test/native-relations.test.mjs`, `native-relation-metrics.mjs`, `native-relation-metrics.test.mjs` | Real-binary Fixture runner and pure direct-call TP/FP/FN check. |
| `package.json`, `.github/workflows/ci.yml` | Run relation Fixtures in the existing clean-install Native integration job. |
| `docs/handoff/specs/NATIVE_IPC.md`, `DESIGN_TRACEABILITY.md`, `CURRENT_STATUS.md` | Synchronize evaluated Java capabilities, exact evidence, and remaining Phase gaps. |

Internal Rust interfaces used across tasks (names and fields are fixed for this plan):

```rust
pub enum RelationKind { Import, Call, Inheritance, Reference }
pub struct RelationSite {
    pub kind: RelationKind,
    pub variant: String,
    pub source_fact_id: String,
    pub target_hint: String,
    pub arity: Option<usize>,
    pub span: SourceSpan,
}
pub enum RelationTarget {
    Resolved { fact_id: String, resolution: &'static str },
    NonResolved { resolution: &'static str, hint: String, candidates: Vec<String> },
}
pub struct ResolvedRelation {
    pub provider_fact_id: String,
    pub provider_kind: String,
    pub source_fact_id: String,
    pub target: RelationTarget,
    pub span: SourceSpan,
}
```

`LanguageAnalysis` gains `relation_sites: Vec<RelationSite>`; its existing `analyze`/`analyze_until` methods leave that vector empty for SYMBOL-only callers. `JavaAnalyzer::analyze_with_relations_until(path, source, deadline, cancelled, max_result_bytes)` extracts sites in the same second-pass parse as symbols. `DeclarationIndex::new(max_bytes)`, `insert(path, symbols) -> Result<(), AnalyzerError>`, `candidates(qualified_name, arity) -> Vec<&SymbolFact>`, and `resolve(path, site) -> ResolvedRelation` are internal; index overflow maps to the existing `AnalyzerError::ResourceLimit`. The index owns compact copies of only declaration fields needed for lookup and charges their estimated bytes; it never owns source text or a Tree-sitter tree. `java_relations::compilation_unit_id(path) -> String` supplies the import site's source ID; only the coordinator constructs/emits the matching ProviderNode when `IMPORT` was requested.

### Task 1: Bounded declaration index and stable relation identity

**Files:** Create `src/relation_index.rs`, `tests/java_relations.rs`; modify `src/language.rs`, `src/java.rs`, `src/lib.rs` within `crates/native-analyzer/`.

**Interfaces:** Consume existing `SymbolFact` and `SourceSpan`; produce the `RelationKind`, `RelationSite`, `RelationTarget`, `ResolvedRelation`, and `DeclarationIndex` interfaces above. Extend internal `SymbolFact` with `is_static: bool`; the IPC NODE payload must not change. Use a domain-separated `java-relation-v1:` digest over length-prefixed path, relation kind/variant, source fact ID, target hint, byte position, and duplicate-site ordinal.

- [ ] **Step 1: Write failing Rust tests** in `tests/java_relations.rs` for a later-file declaration, stable site identity across worker-independent index insertion order, explicit `ResourceLimit` on a tiny index budget, and unchanged P05-W3-001 symbol IDs. Include:

```rust
let mut index = DeclarationIndex::new(4096);
let symbols = JavaAnalyzer::new().unwrap().analyze("src/B.java", b"package demo; class B { void run() {} }").unwrap().symbols;
index.insert("src/B.java", &symbols).unwrap();
assert_eq!(index.candidates("demo.B.run", Some(0)).len(), 1);
assert!(matches!(DeclarationIndex::new(1).insert("src/B.java", &symbols), Err(AnalyzerError::ResourceLimit)));
```

- [ ] **Step 2: Run RED:** `cargo test -p codeatlas-native-analyzer --test java_relations -- declaration_index`; expect unresolved `DeclarationIndex`/missing `is_static`, not a passed test.
- [ ] **Step 3: Implement the smallest index and identity functions** with checked/saturating byte accounting and deterministic sorted candidates. Keep `SymbolFact` ID generation unchanged. Core shape:

```rust
pub fn insert(&mut self, path: &str, symbols: &[SymbolFact]) -> Result<(), AnalyzerError> {
    for symbol in symbols {
        let charge = 512usize.saturating_add(path.len()).saturating_add(symbol.name.len())
            .saturating_add(symbol.qualified_name.as_deref().unwrap_or("").len());
        self.used_bytes = self.used_bytes.saturating_add(charge);
        if self.used_bytes > self.max_bytes { return Err(AnalyzerError::ResourceLimit); }
        self.by_qualified.entry(symbol.qualified_name.clone().unwrap_or_else(|| symbol.name.clone()))
            .or_default().push(symbol.clone());
    }
    Ok(())
}
```

- [ ] **Step 4: Run GREEN:** `cargo test -p codeatlas-native-analyzer --test java_relations -- declaration_index` and `cargo test -p codeatlas-native-analyzer --test java_symbols`; expect all focused and old symbol tests to pass.
- [ ] **Step 5: Commit** only Task 1 files: `git add crates/native-analyzer/src/language.rs crates/native-analyzer/src/java.rs crates/native-analyzer/src/relation_index.rs crates/native-analyzer/src/lib.rs crates/native-analyzer/tests/java_relations.rs` then `git commit -m "feat(native): index Java declarations for relations"`.

### Task 2: Java relation-site extraction

**Files:** Create `crates/native-analyzer/src/java_relations.rs`; modify `src/java.rs`, `src/language.rs`, `src/lib.rs`, `tests/java_relations.rs`.

**Interfaces:** Consume the fixed `RelationSite` and existing `SymbolFact` IDs. Produce `JavaAnalyzer::analyze_with_relations_until(...) -> Result<LanguageAnalysis, AnalyzerError>` without changing `analyze_until` SYMBOL output. Sites use a real enclosing method/constructor/type ID, except imports use `compilation_unit_id(path)`; Task 4 emits that matching ProviderNode only when IMPORT is requested. No synthetic call owner is allowed.

- [ ] **Step 1: Write failing visitor tests** for normal/static/wildcard imports, default package, extends/implements, unqualified/`this`/type-qualified/`new`/`this(...)` calls, type/field/method references, and a call in a static initializer without a safe method source. Assert site kinds, variants, UTF-8 byte ranges, stable owner ID, and no `spring.` facts. Example:

```rust
let analysis = JavaAnalyzer::new().unwrap().analyze_with_relations_until(
    "src/A.java", b"import demo.B; class A extends B { void go() { this.run(); } void run() {} }",
    Instant::now() + Duration::from_secs(2), &AtomicBool::new(false), 4 * 1024 * 1024,
).unwrap();
assert!(analysis.relation_sites.iter().any(|site| matches!(site.kind, RelationKind::Inheritance) && site.target_hint == "B"));
assert!(analysis.relation_sites.iter().any(|site| matches!(site.kind, RelationKind::Call) && site.target_hint == "this.run"));
```

- [ ] **Step 2: Run RED:** `cargo test -p codeatlas-native-analyzer --test java_relations -- relation_sites`; expect the new entry point/site assertions to fail.
- [ ] **Step 3: Implement the Java visitor** in `java_relations.rs`, called from the second-pass parser before the Tree-sitter tree is dropped. Match explicit grammar node kinds/fields, derive a site only when an approved source owner exists, charge site-result bytes against `max_result_bytes`, and leave syntax-error coverage `PARTIAL`. Keep invocation syntax as CALL only, not a duplicate REFERENCE. Core return path:

```rust
let relation_sites = if collect_relations {
    crate::java_relations::collect_sites(root, source, relative_path, &collector.symbols, max_result_bytes)?
} else {
    Vec::new()
};
Ok(LanguageAnalysis { symbols: collector.symbols, relation_sites, diagnostics, coverage })
```

- [ ] **Step 4: Run GREEN:** focused `relation_sites` cases plus `cargo test -p codeatlas-native-analyzer --test java_symbols`; expect old exact SYMBOL behavior intact.
- [ ] **Step 5: Commit** Task 2 files with `git commit -m "feat(native): extract Java relation sites"` after explicit `git add` of the files listed above.

### Task 3: Candidate resolution and ambiguity honesty

**Files:** Modify `crates/native-analyzer/src/relation_index.rs`, `tests/java_relations.rs`.

**Interfaces:** Implement `DeclarationIndex::resolve(path, site) -> ResolvedRelation` using the exact internal types above. Use lexical owner, explicit receiver, same-package/import context, and source-spelled arity/signature evidence; candidate arrays are sorted by stable Provider Fact ID. A unique defensible declaration is `EXACT` or `HEURISTIC` as evidence warrants; competing same-arity overloads are `AMBIGUOUS`; absent/external targets are `UNRESOLVED`. The resolver does not generate AST facts or framework meaning.

- [ ] **Step 1: Write RED resolver tests** for cross-file static and direct calls, constructor/`this` calls, normal and wildcard import containers, extends/implements, references, equal-arity overload ambiguity, unknown JDK/dependency methods, and candidate order after reversing file insertion order. Example:

```rust
let resolved = index.resolve("src/A.java", &call_site);
assert!(matches!(resolved.target, RelationTarget::NonResolved { resolution: "AMBIGUOUS", ref candidates, .. } if candidates.len() == 2 && candidates[0] < candidates[1]));
let missing = index.resolve("src/A.java", &external_call);
assert!(matches!(missing.target, RelationTarget::NonResolved { resolution: "UNRESOLVED", ref candidates, .. } if candidates.is_empty()));
```

- [ ] **Step 2: Run RED:** `cargo test -p codeatlas-native-analyzer --test java_relations -- resolves_relation`; expect missing/incorrect resolution tests to fail.
- [ ] **Step 3: Implement only the scoped resolver**: filter by Java kind/owner/import/arity, do not choose an overload from arity when multiple remain, keep bounded original hints, and produce IDs independent of target selection. Map unsupported syntax without candidates to `UNSUPPORTED`; never turn a null or missing target into a fabricated ProviderNode.

```rust
match candidates.len() {
    0 => RelationTarget::NonResolved { resolution: "UNRESOLVED", hint: site.target_hint.clone(), candidates: vec![] },
    1 if evidence_is_exact(site, &candidates[0]) => RelationTarget::Resolved { fact_id: candidates[0].provider_fact_id.clone(), resolution: "EXACT" },
    1 => RelationTarget::Resolved { fact_id: candidates[0].provider_fact_id.clone(), resolution: "HEURISTIC" },
    _ => RelationTarget::NonResolved { resolution: "AMBIGUOUS", hint: site.target_hint.clone(), candidates: candidates.iter().map(|item| item.provider_fact_id.clone()).collect() },
}
```

- [ ] **Step 4: Run GREEN:** all `java_relations` and `java_symbols` tests; compare forward/reverse insertion results byte-for-byte.
- [ ] **Step 5: Commit** resolver and tests with `git commit -m "feat(native): resolve Java relation candidates honestly"` after explicit path staging.

### Task 4: Bounded two-pass Native IPC emission

**Files:** Modify `crates/native-analyzer/src/analyze.rs`, `tests/analyze.rs`; add process-level relation cases to `tests/analyze.rs`. Leave `src/protocol.rs` and handshake changes to Task 5 after Fixture gates.

**Interfaces:** A relation `ANALYZE` request accepts `SYMBOL` plus requested `IMPORT`, `CALL`, `INHERITANCE`, `REFERENCE` and no other capability. A SYMBOL-only request keeps its existing one-pass bytes. For relation requests, the first pass builds `DeclarationIndex`; the second calls `analyze_with_relations_until`, resolves requested sites, emits strict `EDGE` and per-file `COVERAGE`, increments exact terminal counts, and emits the compilation-unit NODE only for IMPORT. Advertise additional capabilities only after Task 5 Fixture evidence is green. Preserve `REQUEST_FAILED` for pre-start invalid/unsupported capability and `ANALYSIS_FAILED` for post-start source/resource/budget/parser failures.

- [ ] **Step 1: Write RED process tests** for an indexed target in the second file, worker counts 1/2 with reverse completion, source mutation between passes (including same-length mutation via an injected test hook), tiny index budget, small maxEvents, JSONL byte overflow, zero-relation success, syntax-error partial, and exact raw-byte checksum/edge count. Example:

```rust
let one = run_analyzer_with_args(&relation_request, &["--parse-workers", "1"]);
let two = run_analyzer_with_args(&relation_request, &["--parse-workers", "2"]);
assert_eq!(one.1, two.1);
assert!(one.1.iter().any(|event| event["type"] == "EDGE"));
assert_eq!(one.1.last().unwrap()["payload"]["counts"]["edges"], 1);
```

- [ ] **Step 2: Run RED:** `cargo test -p codeatlas-native-analyzer --test analyze -- relation_`; expect unsupported capability or missing EDGE, and failure tests must not report success.
- [ ] **Step 3: Implement two-pass coordination** using the existing `timed_batch`, `read_verified_source`, `EventWriter`, and `remaining_budget`. Account index bytes separately from `worker_count * WORKER_RESERVATION_BYTES` and reject before allocating beyond the request budget. Use the same verified fingerprint in both passes; any second-pass change is `SOURCE_CHANGED`. Serialize target variants in the strict IR shape and reserve room for the failure terminal before each event. Core emission:

```rust
let target = match relation.target {
    RelationTarget::Resolved { fact_id, resolution } => json!({"state": "RESOLVED", "resolution": resolution, "target": {"providerId": "native", "providerFactId": fact_id, "factType": "NODE"}}),
    RelationTarget::NonResolved { resolution, hint, candidates } => json!({"state": "UNRESOLVED", "resolution": resolution, "originalHint": hint, "candidates": candidates.into_iter().map(|providerFactId| json!({"providerId": "native", "providerFactId": providerFactId, "factType": "NODE"})).collect::<Vec<_>>() }),
};
```

- [ ] **Step 4: Run GREEN:** `cargo test -p codeatlas-native-analyzer --test analyze`, `--test handshake`, and `--test java_symbols`; assert exact counts/checksum, failure terminals, no stdout logs, and old SYMBOL-only bytes. Do not advertise new DESCRIBE capabilities until Task 5 goldens/metrics pass; make descriptor registration the final substep after that evidence.
- [ ] **Step 5: Commit** coordinator/tests without premature capability registration: `git commit -m "feat(native): emit bounded Java relations over IPC"` after staging only Task 4 paths.

### Task 5: Registered Fixtures, direct-call gates, and evidence

**Files:** Create four `fixtures/native/java-*/` relation trees; create `packages/providers/test/native-relations.test.mjs`, `native-relation-metrics.mjs`, `native-relation-metrics.test.mjs`; modify `native-analysis.test.mjs`, `package.json`, `.github/workflows/ci.yml`, `crates/native-analyzer/src/protocol.rs`, `tests/handshake.rs`, `docs/handoff/specs/NATIVE_IPC.md`, `DESIGN_TRACEABILITY.md`, `CURRENT_STATUS.md`.

**Interfaces:** Each manifest v1 names `source/`, `expected/{nodes,edges,coverage,diagnostics}.json`, capability list, and labeled critical direct-call IDs. The new real-binary suite enumerates requested Java files, calculates raw-byte SHA-256, calls `executeNativeRequest`, compares every expected payload and validates the old client terminal/checksum. `directCallMetrics(expected, actual, criticalIds)` is pure and returns `{ tp, fp, fn, precision, recall }`; its suite asserts precision `>= 0.95`, recall `>= 0.90` without rounding. Manifest `qualityGates` remains `{}` until a separately reviewed executable evaluator supports call-specific names.

- [ ] **Step 1: Write RED goldens and metric tests.** Pin each relation-site edge including resolution/candidates and source range; include a wrong-target test that yields one FP and one FN, an extra resolved call FP, a missing/ambiguous critical call FN, and zero-denominator non-pass. Example:

```js
assert.deepEqual(directCallMetrics(expected, wrongTarget, criticalIds), {
  tp: 0, fp: 1, fn: 1, precision: 0, recall: 0,
});
assert.deepEqual(edges, JSON.parse(await readFile(fixture.expected.edges, 'utf8')));
assert.ok(metrics.precision !== null && metrics.precision >= 0.95);
assert.ok(metrics.recall !== null && metrics.recall >= 0.90);
```

- [ ] **Step 2: Run RED:** `cargo build --workspace -j 1`; then `node --test packages/providers/test/native-relation-metrics.test.mjs packages/providers/test/native-relations.test.mjs`; expect missing metric/fixtures or mismatched edges, not a false green. Run `node --test packages/providers/test/native-analysis.test.mjs` too; its old discovery assertion must be narrowed to the two prior IDs without changing goldens.
- [ ] **Step 3: Complete Fixture runner/metric implementation**, add the new suite to `test:native-analysis`, and let the existing CI Native job run that script. After all four Fixtures and direct-call gates pass, add `IMPORT`, `CALL`, `INHERITANCE`, `REFERENCE` to Java DESCRIBE and assert exact handshake. Synchronize Native IPC's P05-W3-001-only paragraph with the new evaluated scope; do not extend wire schema. Core metric logic:

```js
const precision = tp + fp === 0 ? null : tp / (tp + fp);
const recall = tp + fn === 0 ? null : tp / (tp + fn);
return { tp, fp, fn, precision, recall };
```

- [ ] **Step 4: Run GREEN and full acceptance:** `cargo fmt --all --check`; `cargo build --workspace -j 1`; `cargo clippy --workspace --all-targets -- -D warnings`; `cargo test --workspace -j 1`; installed TypeScript build and root test fileset; `node --test packages/providers/test/native-relation-metrics.test.mjs packages/providers/test/native-relations.test.mjs packages/providers/test/native-analysis.test.mjs`; `node scripts/check-architecture.mjs`; `node_modules/.bin/prettier.cmd --check .`; `git -c core.safecrlf=false diff --check`. Attempt `pnpm verify` and record any environment blocker without relabeling direct substitutes. Confirm hosted clean-install TypeScript, Native Java integration, and Rust jobs before calling integration complete.
- [ ] **Step 5: Record and commit evidence:** replace generic P05-W3-002 traceability with exact Fixture/test/metric paths and threshold results; update `CURRENT_STATUS.md` with commands, output counts, SHA, source/index memory policy, failure cases, and remaining Phase 0.5 gaps. Check staged diff, then `git commit -m "test(native): verify Java relation fixtures and gates"`. Request whole-branch review; fix any Critical/Important findings with fresh RED→GREEN evidence before push/PR. Do not merge or claim Phase 0.5 exit automatically.

## Self-review and execution boundary

All design sections map to Tasks 1–5: bounded declaration/index and identity (1), syntax/source ownership (2), ambiguity and cross-file resolution (3), two-pass IPC/failure/backpressure (4), Fixtures/metrics/descriptor/evidence (5). The five Review Focus conditions have owning tests above. The only intentionally deferred work is already allocated to later P05 tasks in the governing Handoff. This plan authorizes no product edits until the user reviews it and selects an execution method.
