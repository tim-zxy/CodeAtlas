# Phase Acceptance

## Evidence rules

Every checked item must cite a reproducible command and fixture result in `CURRENT_STATUS.md`. Mandatory gates cannot be waived by a narrative assessment. Thresholds apply to the declared frozen fixture set; expanding the set requires a deliberate baseline review.

For Phase 0 and Phase 0.5, each result must also name the corresponding task and governing spec from `DESIGN_TRACEABILITY.md`. A Fixture without a task owner, a task without a Fixture/check, or an acceptance gate without both is a traceability failure.

## Phase 0 exit

- [ ] Monorepo TypeScript packages and Rust crate build and test in CI.
- [ ] Dependency guardrails reject forbidden imports.
- [ ] Canonical common, source, code, evidence, and envelope schemas round-trip.
- [ ] Fresh repository and workspace databases migrate to the current Phase 0 schema.
- [ ] Sequential upgrade, rollback-on-failure, idempotence, lock, checksum, and `DATABASE_TOO_NEW` cases pass.
- [ ] Native IPC v1 schemas and shared fixtures pass in TypeScript and Rust.
- [ ] `DESCRIBE` can express language/capability metadata without binding the Provider contract to Java; stdout remains protocol-only and stderr carries logs.
- [ ] Rust `DESCRIBE` and TypeScript handshake negotiate compatible protocol and IR versions.
- [ ] Fixture registry discovers and validates manifests.
- [ ] Comparator reports missing, extra, semantic, and resolution differences.
- [ ] Metrics engine calculates node, edge, and critical-fact precision/recall.

Phase 0 explicitly does not require Java parsing.

## Phase 0.5 exit

- [ ] A Java repository is scanned with ignore, generated/vendor/test, binary, and include/exclude handling.
- [ ] Native analysis emits symbols, imports, direct calls, inheritance, references, diagnostics, and coverage through IPC v1.
- [ ] Java extraction is behind a `LanguageAnalyzer` boundary; framework interpretation is absent from the language adapter.
- [ ] Provider facts normalize into canonical facts while unresolved targets remain unresolved.
- [ ] Canonical facts, evidence, and provider bindings persist correctly.
- [ ] Full-analysis failure preserves the previous active graph.
- [ ] One-file add, modify, and delete changes use validated incremental patches.
- [ ] Changed-file refresh does not silently reparse an unchanged repository; restart uses file fingerprints and does not require persisted ASTs.
- [ ] Cold, 1-file, 5-file, and 50-file scenarios report stage durations and peak memory with pinned inputs; any numeric performance threshold requires a reviewed baseline.
- [ ] Removed provider support leaves no stale binding; a fact remains while another provider still supports it.
- [ ] `understand` and code-level `trace` return locations, relations, confidence, and coverage warnings.
- [ ] Critical Symbol Recall is at least 95 percent.
- [ ] Critical Direct Call Precision is at least 95 percent.
- [ ] Critical Direct Call Recall is at least 90 percent.
- [ ] Incremental correctness is 100 percent for declared fixtures.
- [ ] Stale provider-binding facts equal zero.

## Phase 1 exit

- [ ] Spring, Mongo, Kafka, and FastAPI fixtures produce canonical entry points, tasks, data resources, and contracts.
- [ ] Critical entry-point and boundary recall meet the approved fixture baseline; no critical path is silently omitted.
- [ ] `ExecutionGraph` models request, event, job, task, and batch contexts without flattening asynchronous boundaries.
- [ ] `RuntimeFlow` is deterministically derived and every step retains support references.
- [ ] HTTP and message contract matching reports matched, ambiguous, unresolved, conflicted, outside-workspace, and known-external outcomes.
- [ ] Cross-repository trace preserves repository revision references and boundary confidence.
- [ ] Markdown and ADR sources produce structural Document IR, evidence, and claims.
- [ ] Component, Capability, Integration, and grounded `BusinessFlow` candidates pass schema and grounding validation.
- [ ] Rename/reword fixtures preserve knowledge identity; structural changes create correct revisions.
- [ ] Semantic knowledge remains manual and the last published revision survives failed/partial compilation.
- [ ] Source freshness and compilation currency are reported independently.
- [ ] FTS5 works without embeddings.
- [ ] The six core MCP tools conform to Agent API schemas and permission rules.
- [ ] Local-only operation, secret filtering, remote opt-in, provider environment sanitization, and prompt-injection fixtures pass.
- [ ] Install, init, index, agent setup dry-run, doctor, and status flows work without a Rust toolchain or LLM.
- [ ] The vulnerability-processing and spring-fastapi-kafka end-to-end fixtures pass all critical probes.
- [ ] The standard Wiki reads published Knowledge through KnowledgeQuery/Application API. If a WikiGenerator exists, a thin facade/default-profile adapter preserves it; a complete user-authored WikiSpec is not required.
- [ ] Default-profile reprojection never invokes `update_knowledge`; locked policy rejects unauthorized customization; missing required Knowledge yields explicit diagnostics, not invented text.
- [ ] Registered language capabilities have Fixture/Evaluation evidence; Phase 1 does not require all languages.

## Phase 2 exit direction

Detailed numeric baselines are set during Phase 2 planning. Acceptance must cover architecture/decision/migration knowledge, state-aware consistency and drift, curated feedback, advanced reconciliation, hybrid retrieval with rebuildable vectors, impact/change context, usage/agent utility, richer documents, daemon/local HTTP, and expanded authorization. Core behavior must still work in LITE mode without vectors.

Projection acceptance covers Declarative WikiSpec, profile inheritance and pin stability, six-dimensional artifact provenance, validation statuses, and diff. Multi-language performance gates use measured cold/incremental baselines and full-rebuild correctness comparisons, not hand-declared capability maturity.

## Phase 3 exit direction

Acceptance is defined from measured Phase 2 gaps. Any advanced analyzer, adaptive routing, session context, packaging, or plugin ecosystem feature must demonstrate downstream agent utility, bounded resource use, compatibility with Canonical IR, and no regression to local-first/security invariants.

If Wiki extensions or analysis-depth profiles are selected, acceptance also verifies extension permissions, no canonical writes, per-language quality evidence, and profile comparability.
