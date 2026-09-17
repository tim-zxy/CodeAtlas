# Work Breakdown

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

### P05-W3-002 Imports, calls, inheritance, and references

Depends on P05-W3-001. Support normal/static/wildcard imports; direct/this/static/constructor calls; extends/implements; and initial type/method/field references. Preserve overload ambiguity and unresolved calls. Fixtures include `java-call-basic`, `java-overload`, `java-inheritance`, and `java-unresolved-call`.

### P05-W3-003 Coverage output

Depends on P05-W3-002. Emit eligible, covered, unsupported, partial, and resolution-level statistics per file/capability. Queries and evaluations must surface incomplete coverage.

### P05-W4-001 Canonical normalizers and fact identity

Depends on P05-W3-002. Normalize provider nodes/edges to language-neutral forms and implement `NodeFactKey`/`EdgeFactKey`. A CALL key includes caller, resolved target or unresolved hint, callsite, and revision semantics.

### P05-W4-002 FactMerger v0.1 and bindings

Depends on P05-W4-001. Merge identical facts, retain multiple evidence/bindings, honor the resolution hierarchy, and aggregate confidence conservatively. Prove removal of one support does not remove a still-supported fact with `two-provider-same-call`.

### P05-W1-010 Full analysis apply

Depends on repository schema and normalization. Stream into staging, validate, use batched SQL within one activation transaction, atomically activate the indexed revision, and retain the previous graph on failure. Analysis coordination must call `CanonicalFactStore`, not compose SQL or commit per node/edge.

### P05-W1-011 Incremental patch apply

Depends on P05-W1-010 and FactMerger. Atomically support upsert/remove node and edge events, recompute canonical support, and prevent dangling/stale bindings.

### P05-W2-010 Change detector

Depends on fingerprints. Produce added, modified, deleted, and renamed changes; delete-plus-add is acceptable for rename in Phase 0.5. Prove stable results across restart.

### P05-W3-020 Native REFRESH

Depends on change detector and patch apply. Consume changed files and emit a validated patch stream. Refresh reparses changed files plus a bounded resolver-dependent set, not the whole repository by default; in-memory incremental trees are an optimization only while alive, and ASTs are not persisted. Fixtures: modify call target, delete class/method, add class/method, and change import.

### P05-W5-001 Graph query and entry-less trace

Depends on active canonical store. Implement get symbol, find symbols, incoming/outgoing edges, and bounded call traversal. Return confidence, coverage, freshness, and source references.

### P05-W8-001 Index, understand, and trace CLI

Expose full/incremental/status indexing, symbol understanding, and code-level trace. Explicitly label results as code traces, not `RuntimeFlow` or `BusinessFlow`.

### P05-W9-001 Phase 0.5 evaluation suite

Freeze symbol, call, overload, inheritance, unresolved, incremental, and provider-merge fixtures. Enforce the numeric gates in `PHASE_ACCEPTANCE.md`, write a machine-readable report with stage durations and peak memory for pinned cold/1-/5-/50-file scenarios, and block Phase 1 promotion on failure. No new numeric latency threshold is implied.

## Phase 1 planning package

After Phase 0.5, the Engineering Agent creates reviewed task groups for: framework plugins; `ExecutionGraph` and `RuntimeFlow`; contracts/cross-repository stitching; Document IR/claims; knowledge workflows/identity/reconciliation/publication and the standard Wiki projection; LLM runtime; Agent API/MCP; security; evaluation; and packaging. Use `vulnerability-processing` and `spring-fastapi-kafka` as end-to-end acceptance fixtures. Do not redesign the target architecture or pull Declarative WikiSpec into Phase 1.

## Parallelization constraints

In Phase 0, monorepo, basic IR, migration runner, IPC schema, and fixture harness may proceed in parallel after shared names are agreed; Rust analysis waits for IPC and Code IR freeze. In Phase 0.5, scanner, parser, and fixture authoring may proceed in parallel; FactMerger waits for fact identity. Activation and evaluation integration follow normalized facts.
