# Phase Acceptance

## Evidence rules

Every checked item must cite a reproducible command and fixture result in `CURRENT_STATUS.md`. Mandatory gates cannot be waived by a narrative assessment. Thresholds apply to the declared frozen fixture set; expanding the set requires a deliberate baseline review.

For Phase 0 and Phase 0.5, each result must also name the corresponding task and governing spec from `DESIGN_TRACEABILITY.md`. A Fixture without a task owner, a task without a Fixture/check, or an acceptance gate without both is a traceability failure.

## Phase 0 exit

- [x] Monorepo TypeScript packages and Rust crate build and test in CI.
- [x] Dependency guardrails reject forbidden imports.
- [x] Canonical common, source, code, evidence, and envelope schemas round-trip.
- [x] Fresh repository and workspace databases migrate to the current Phase 0 schema.
- [x] Sequential upgrade, rollback-on-failure, idempotence, lock, checksum, and `DATABASE_TOO_NEW` cases pass.
- [x] Native IPC v1 schemas and shared fixtures pass in TypeScript and Rust.
- [x] `DESCRIBE` can express language/capability metadata without binding the Provider contract to Java; stdout remains protocol-only and stderr carries logs.
- [x] Rust `DESCRIBE` and TypeScript handshake negotiate compatible protocol and IR versions.
- [x] Fixture registry discovers and validates manifests.
- [x] Comparator reports missing, extra, semantic, and resolution differences.
- [x] Metrics engine calculates node, edge, and critical-fact precision/recall.

Phase 0 explicitly does not require Java parsing.

## Phase 0.5 exit

- [x] A Java repository is scanned with ignore, generated/vendor/test, binary, and include/exclude handling (P05-W2-001; three declared Source Fixtures and reproducible commands in `CURRENT_STATUS.md`).
- [ ] Native analysis emits symbols, imports, direct calls, inheritance, references, diagnostics, and coverage through IPC v1.
- [ ] Java extraction is behind a `LanguageAnalyzer` boundary; framework interpretation is absent from the language adapter.
- [ ] Provider facts normalize into canonical facts while unresolved targets remain unresolved.
- [ ] Canonical facts, evidence, and provider bindings persist correctly.
- [ ] Full-analysis failure preserves the previous active graph and activation ID/fingerprint; a retained graph is not reported current solely because a mutable `WORKTREE` ID matches.
- [ ] One-file add, modify, and delete changes use validated incremental patches.
- [ ] Changed-file refresh does not silently reparse an unchanged repository; restart uses file fingerprints and does not require persisted ASTs.
- [ ] Cold, 1-file, 5-file, and 50-file scenarios report stage durations and peak memory with pinned inputs; any numeric performance threshold requires a reviewed baseline.
- [ ] Worker Consistency on pinned inputs preserves normalized Canonical Graph semantics, coverage, and stale-fact state across worker counts/completion orders; in-flight files, output, and staging remain bounded under declared budgets.
- [ ] Analyzer outcomes distinguish timeout/budget failure, parser exception, unsupported language/capability, syntax-error/partial coverage, and successful zero-fact analysis without publishing partial graph state.
- [ ] P05-W3-003 v2 `ANALYZE` coverage records report source-grounded eligible/covered/unsupported/partial site counts and relation-resolution distribution per file/capability; strict v1 remains usable with numeric statistics explicitly unavailable. Exact Fixtures and failure recovery pass; no new numerical gate is implied (ADR-015).
- [ ] Removed provider support leaves no stale binding; a fact remains while another provider still supports it.
- [ ] P05-W1-011 patch application reselects from persisted active-support candidates after one Provider removal, rejects legacy missing candidates with a full-analysis fallback, and preserves graph/Evidence/bindings and activation ID/fingerprint on failed or stale-base patches (registered `p05-incremental-patch-apply-v1`; no new numeric gate).
- [ ] P05-W1-011's registered Fixture proves same-`WORKTREE`-ID fingerprint advancement and controlled `FULL_ANALYSIS_REQUIRED` for different revision IDs or immutable targets, with exact old-graph/Evidence/binding/candidate/pointer preservation. This is an applicability boundary, not a replacement for the existing Phase 0.5 incremental-correctness or no-default-full-reparse gates.
- [ ] `understand` and code-level `trace` return locations, relations, confidence, and coverage warnings.
- [ ] Critical Symbol Recall is at least 95 percent.
- [ ] Critical Direct Call Precision is at least 95 percent.
- [ ] Critical Direct Call Recall is at least 90 percent.
- [ ] Incremental correctness is 100 percent for declared fixtures.
- [ ] Stale provider-binding facts equal zero.

ADR-016 adds a P05-W3-020 applicability check without replacing the gates above: compatible complete derived summaries and graph/support/Evidence/coverage/indexed fingerprint must activate atomically; legacy/incompatible state, stale/empty-latest-delta retry, malformed metadata, shared-container ownership and resource overflow retain the last good graph. Prove restart/dependent resolution with real Native streams and unchanged-file parse counts. The first contract packet only establishes strict cross-language schema/byte agreement and cannot check these runtime gates. No Fixture baseline or numerical threshold changes at design acceptance.

Packet B's [R010/full-bootstrap detailed design](../superpowers/specs/2026-10-01-p05-w3-020-state-bootstrap-design.md) is accepted; its [implementation plan](../superpowers/plans/2026-10-01-p05-w3-020-state-bootstrap.md) is approved for native execution; Tasks 1–2 local migration/read/seal checks pass; Task 3 output validation/corpus and reviewed read/seal profile pass local verification; local Task 3 is complete. Remaining packet checks stay open. Its planned migration/read, full-output and atomic lifecycle Fixtures are additional task evidence, not checked Phase 0.5 exits, a new numerical threshold, or a substitute for real REFRESH differential Evaluation. No Phase 0.5 exit is checked by the Task 1 migration result.

Task 3 numeric approval update (2026-10-01): the user answered the exact reservation question with “继续”. The unaltered report is preserved separately at `fixtures/storage/native-analysis-state/memory-baseline-task3.json`, SHA-256 `a9451c810ae270340cb499cac5dbf01d0fe274b755861a6725b4576eb17815b1`, with capture status unchanged. The current-build Windows read/seal profile now reserves 250,855,424 bytes plus twice retained SQL UTF-8 bytes; Task 2 report/profile is unchanged. Production matching-profile and one-byte-below/refusal checks passed within 83/83 focused tests after explicit RED for the absent current profile. Earlier pending-review/current-build refusal wording is historical and superseded by this approval/install record. Final post-approval root Node regression passes 762 with one existing Windows skip; focused tests pass 83/83, Cargo 88/88, existing real Native tests 25/25, build/type/architecture/fmt/Clippy/format/diff pass. Local Task 3 local Task 3 is complete. Decoder/transport workspace admission is still Task 4 work; no real producer/bootstrap/REFRESH or phase exit is claimed.

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
- [ ] L0 summary, L1 task-relevant knowledge, and L2 deeper engineering context are budgeted and retrieved on demand; startup does not preload the full Wiki and read-only queries do not invoke `update_knowledge`.
- [ ] If source-grounded degraded candidates are enabled, they retain evidence, generation method, coverage and unverified-relation limitations, and pass the normal Reconciliation/Quality Gate before publication; local-only and security blocks never trigger remote fallback.
- [ ] Standard System Wiki sections use only published Knowledge and report missing or stale cross-repository support rather than inventing contracts, flows, or migration state.

## Phase 2 exit direction

Detailed numeric baselines are set during Phase 2 planning. Acceptance must cover architecture/decision/migration knowledge, state-aware consistency and drift, curated feedback, advanced reconciliation, hybrid retrieval with rebuildable vectors, impact/change context, usage/agent utility, richer documents, daemon/local HTTP, and expanded authorization. Core behavior must still work in LITE mode without vectors.

Projection acceptance covers Declarative WikiSpec, profile inheritance and pin stability, six-dimensional artifact provenance, validation statuses, and diff. Multi-language performance gates use measured cold/incremental baselines and full-rebuild correctness comparisons, not hand-declared capability maturity.

Diagram projection direction covers a grounded lightweight DiagramModel, default Mermaid rendering, support/version references, type-specific validation, and explicit ordering evidence for cross-repository sequence diagrams. No DiagramModel or renderer is a Phase 0.5 gate, and Phase 2 numerical gates are set only from reviewed evidence.

## Phase 3 exit direction

Acceptance is defined from measured Phase 2 gaps. Any advanced analyzer, adaptive routing, session context, packaging, or plugin ecosystem feature must demonstrate downstream agent utility, bounded resource use, compatibility with Canonical IR, and no regression to local-first/security invariants.

If Wiki extensions or analysis-depth profiles are selected, acceptance also verifies extension permissions, no canonical writes, per-language quality evidence, and profile comparability.
