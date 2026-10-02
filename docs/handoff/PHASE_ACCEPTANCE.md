# Phase Acceptance

Proposed measurement-stability amendment (2026-10-02): detailed design is written following direction approval, but the formula/reporting contract is awaiting written review. Proposed additional packet B evidence is immutable compatible-history provenance, independently reproducible `M/J/prior-floor` computation, frozen-candidate all-class verification and retained observations on CI failure. All current acceptance gates remain unchanged until approval; no concrete new reservation or completed gate follows from this document. See the [written proposal](../superpowers/specs/2026-10-02-p05-w3-020-memory-profile-stability-proposal.md).

Current packet B quality hold (2026-10-02): the approved212,692,992-byte profile yielded Runtime50/50, but fresh memory corpus40/41 failed on213,086,208 bytes; identical-input diagnostics reached245,719,040 bytes. The insufficient new profile is withdrawn, old profiles and every gate retained. The proposed measurement-stability detail needs review; no new numeric threshold is selected and no packet/phase acceptance is claimed. See CURRENT_STATUS for exact report identities and reproducible commands.

Packet B review correction (2026-10-02): acceptance additionally proves the already-required byte preflight before Runtime schema copy/database observation and fresh supported-environment read/seal plus transport peaks no greater than the reviewed overall reservation. The Windows CI corpus step fails closed if its exact build/environment lacks a reviewed profile. These are implementation corrections to existing gates, not new numeric thresholds. Revised paired profile approval and final Runtime/root regression remain pending; earlier Task 7 local pass records apply to `37c96bb`, not the corrected unapproved build. Phase 0.5 remains 10/14 integrated, with original exits open.

Packet B execution update (2026-10-02): Task 6 is locally committed as `0b2af73`, with 24 real bootstrap/lifecycle cases, 98/98 expanded focused tests and root 796 pass/0 fail/one existing Windows skip. Task 7 now advertises full v3 `[1,2,3]` after observed RED→GREEN descriptor tests; strict v1/v2, IR v1, capability list and explicit v3 REFRESH refusal are unchanged. The required bootstrap runner obtains the actual descriptor through the production client rather than using a future descriptor. Native integration CI selects Windows/x64 Node 24.15.0 because only that exact environment has reviewed full-transport admission; Ubuntu TypeScript and Windows Rust gates remain. This is configured coverage, not observed hosted CI or Linux bootstrap evidence. Final Task 7 gates/review remain pending; earlier unimplemented/profile-review-blocked wording is historical. Parent REFRESH and original Phase 0.5 exits stay open at 10/14 integrated, with no new milestone or deferred scope.

Task 6 final local gates (2026-10-02): real full-bootstrap lifecycle index now contains 24 executed cases, covering reopen, same-fingerprint token race, complete-source write-lock drift, four rollback points, legacy full/patch success and failure, source reconciliation, unavailable/incompatible read/no-parse, zero-file/zero-fact success, analyzer failure/cancellation, matching read-only/unreviewed pre-observation refusal, R009 compatibility and broken-R010 rejection. Final declared expanded command passes **98/98** (26098.8822 ms). Final exact root Node entry passes **797 total / 796 pass / 0 fail / 1 existing Windows skip** (136997.1949 ms); the initial root failure was the shell inventory missing the plan-required JAVA_NORMALIZER_VERSION export, synchronized without weakening its inventory assertion. Forced 16-project TS build, separate IR type tests, architecture 17, Rust fmt/Clippy and Cargo workspace 94/94 pass; existing MSVC test-linker informational warning is disclosed. Required root native-analysis script now includes the real bootstrap suite after Rust build; Runtime has a dedicated native-bootstrap entry. Node built identity remains the approved repaired build after all forced builds. Local Task 6 gates pass; commit bookkeeping follows. Task 7 advertisement/hosted-platform integration, whole-branch review and real REFRESH remain open; Phase 0.5 stays 10/14. No pnpm-wrapper/hosted-CI, Linux bootstrap, push, PR or merge success is claimed.

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

Task 3 numeric approval update (2026-10-01): the user answered the exact reservation question with “继续”. The unaltered report is preserved separately at `fixtures/storage/native-analysis-state/memory-baseline-task3.json`, SHA-256 `a9451c810ae270340cb499cac5dbf01d0fe274b755861a6725b4576eb17815b1`, with capture status unchanged. The current-build Windows read/seal profile now reserves 250,855,424 bytes plus twice retained SQL UTF-8 bytes; Task 2 report/profile is unchanged. Production matching-profile and one-byte-below/refusal checks passed within 83/83 focused tests after explicit RED for the absent current profile. Earlier pending-review/current-build refusal wording is historical and superseded by this approval/install record. Final post-approval root Node regression passes 762 with one existing Windows skip; focused tests pass 83/83, Cargo 88/88, existing real Native tests 25/25, build/type/architecture/fmt/Clippy/format/diff pass. Local Task 3 is complete. Decoder/transport workspace admission is still Task 4 work; no real producer/bootstrap/REFRESH or phase exit is claimed.

Task 4 current state: separate full-v3 Provider transport and required process/memory runners are implemented locally; Runtime purpose admission rejects read-only evidence for `FULL_TRANSPORT`. The user approved the paired current-build Windows reservation of 247,132,160 bytes plus twice retained SQL UTF-8 bytes; exact profile installation and fresh admission/refusal gates pass. Final registered root entry passes 795 with one existing Windows skip; local Task 4 gates are complete, commit bookkeeping follows. Tasks 5–7 remain open. See CURRENT_STATUS for raw-report/corpus identities and commands. No real producer/bootstrap/REFRESH, advertisement, phase exit or milestone change is claimed.

Task 5 local producer gates (2026-10-02): full-only Rust v3 now passes 26 real-binary tests against seven existing Java Fixtures and mandatory TEMP correspondence seal; combined Native suites pass 51/51, Rust 94/94 and root Node 795 pass/one existing Windows skip. Context, metadata/resource/oversize, source mutation, worker consistency, partial/empty and cancellation/refusal evidence is recorded in CURRENT_STATUS and B2 Traceability. No Phase 0.5 exit is checked: Task 6 atomic activation/legacy invalidation, Task 7 handshake publication and subsequent real REFRESH differential Evaluation remain open. Frozen phase thresholds and milestones are unchanged.

Task 6 draft gates remain unchecked: ten bootstrap-dependent B3 cases currently fail at required profile admission for the changed Node build; only the real legacy token defect regression and zero-observation unreviewed-environment refusal pass. B3 has twelve indexed draft cases but still needs legacy patch/reconciliation/source/context coverage, complete atomic/reopen proof and required runner integration. ADR-016 records the evidence-based internal snapshot-count token refinement. New paired 65/70-observation memory proposals await numeric review, not installation or phase acceptance; see CURRENT_STATUS.

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
