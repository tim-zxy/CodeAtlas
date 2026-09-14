# Current Status

## Pack status

- Design source: completed conversation design, consolidated here.
- Handoff assembly: refreshed as the agent-neutral Engineering Handoff Pack.
- Primary handoff entry: `ENGINEERING_HANDOFF.md`.
- Compatibility entry: `CODEX_HANDOFF.md`.
- Implementation repository: P0-W0-001, P0-W0-002, P0-W0-003, and P0-W1-001 are complete with fresh local verification and successful hosted CI evidence.
- Active implementation phase: Phase 0.

## Phase readiness

| Phase | Readiness | Implementation progress |
|---|---|---|
| 0 | IMPLEMENTATION-READY | P0-W0-001, P0-W0-002, P0-W0-003, and P0-W1-001 complete |
| 0.5 | IMPLEMENTATION-READY | 0 percent |
| 1 | DESIGN-READY | 0 percent |
| 2 | ARCHITECTURE-READY | 0 percent |
| 3 | ROADMAP/ARCHITECTURE-READY | 0 percent |

## Next action

Proceed with P0-W1-002 Source and revision IR, the first next-listed Phase 0 task in `WORK_BREAKDOWN.md` whose predecessors are satisfied. Preserve predecessor order and the task-level Fixture, Evaluation, Acceptance, documentation, and traceability requirements.

## Active task evidence

### P0-W0-001 Monorepo bootstrap

- Status: complete.
- Implementation commit: `55710178f2ea15b2fe76d0cdd5a0a38decf232d8`.
- Governing specification: `specs/MODULE_BOUNDARIES.md`.
- Fixture / Evaluation / Acceptance: workspace build and TypeScript/Rust CI smoke defined by `WORK_BREAKDOWN.md` and the Phase 0 monorepo gate in `PHASE_ACCEPTANCE.md`.
- TypeScript evidence: frozen lockfile install passed; all 16 TypeScript workspace projects built independently; formatting passed; 21 of 21 structure and process-level smoke tests passed.
- Rust evidence: `cargo fmt --all --check`, workspace build, Clippy with warnings denied, and workspace tests passed; 2 of 2 native analyzer process-level smoke tests passed.
- Architecture evidence: no app or package dependency fields; no SQLite, LLM, embedding/vector, parser, network listener, or file-watcher implementation markers were found in task source roots.
- Recovery / preservation impact: none; this task introduces no Canonical State, database migration, Provider Facts, or Published Knowledge.
- Contract changes: physical module and toolchain shells only; no Canonical IR or public runtime contract was introduced.
- Design changes: none. Rust is pinned to 1.98.1; this is an implementation pinning adjustment, not an architecture change.
- Hosted CI evidence: GitHub Actions run `34434113552` succeeded for commit `74cf1d5` on branch `codex/p0-w0-001-bootstrap` on 2026-09-10; workflow duration was 1 minute 31 seconds.
- Known gap: none for this task.
- Deferred scope check: no Java parser, database/schema, Canonical IR model, IPC, provider integration, LLM, embedding, daemon service, Knowledge compilation, or graph behavior was implemented.

### P0-W0-002 Architecture dependency rules

- Status: complete.
- Implementation commit: `e051f28e1546ef63095f727cbdc49dff383f5fd5`.
- Governing specification: `specs/MODULE_BOUNDARIES.md`.
- Fixture / Evaluation / Acceptance: injected allowed, forbidden-import, undeclared/unknown internal dependency, dependency-cycle, CommonJS, and Native Analyzer SQLite-ownership cases mapped by `DESIGN_TRACEABILITY.md` to the Phase 0 dependency-guardrail gate in `PHASE_ACCEPTANCE.md`.
- Reproducible command: `pnpm verify` from the repository root.
- TypeScript evidence: formatting passed; all 16 TypeScript workspace projects built independently; all 43 tests passed, including 19 architecture tests comprising 18 injected/controlled cases and the real-workspace check.
- Architecture evidence: `pnpm architecture:check` passed for all 17 projects. Injected fixtures reject `ir -> runtime`, provider -> knowledge, app -> storage, domain cycles, undeclared/unknown internal imports, literal `module.require`, and Native Analyzer SQLite dependencies expressed directly, through renames, through `sqlx`/`diesel` features, multiline TOML, Unicode escapes, workspace inheritance, or feature forwarding.
- Rust evidence: `cargo fmt --all --check`, workspace build, Clippy with warnings denied, and workspace tests passed; 2 of 2 native analyzer smoke tests passed.
- Failure / recovery evidence: every forbidden-edge fixture exits nonzero with a stable diagnostic and uses an isolated temporary workspace; no Canonical State or published artifact is created or mutated.
- Dependency and CI changes: added the explicit `architecture:check` command and wired it into root `test`, `verify`, and the committed GitHub Actions workflow. Cargo TOML is parsed by the exact, lockfile-pinned `smol-toml` 1.8.0 development dependency.
- Schema / migration changes: none.
- Design and traceability changes: none. The implementation enforces the existing Module Boundaries specification and existing P0-W0-002 traceability row without changing a frozen or evolvable contract.
- Review evidence: independent read-only review found no remaining Critical or Important correctness issue after Native Analyzer, CommonJS, TOML feature, escape, multiline, and workspace-inheritance findings were corrected.
- Hosted CI evidence: GitHub Actions run `34434113552` succeeded for commit `74cf1d5` on branch `codex/p0-w0-001-bootstrap` on 2026-09-10; this closes the hosted-CI condition inherited from P0-W0-001.
- Known gap: none for this task.
- Deferred scope check: no Canonical IR, database schema, Java parser, provider/plugin implementation, LLM, embedding/vector index, daemon behavior, Knowledge compilation, or Phase 1+ capability was introduced.

### P0-W0-003 Runtime bootstrap

- Status: complete.
- Implementation revisions: `353e4ba` (configuration bootstrap), `bcf3f91` (runtime composition), `200e2f6` (CLI/MCP construction), `4168685` (Phase 0 runtime specification), and `a60fa0c` (formatting). The current evidence baseline is `a60fa0c`.
- Governing specification: `specs/RUNTIME_CONFIGURATION.md`, with dependency direction governed by `specs/MODULE_BOUNDARIES.md` and local-first boundaries by ADR-001.
- Fixture / Evaluation / Acceptance: `P0-W0-003`'s `CLI/MCP shared runtime-construction smoke`, represented by `scripts/test-runtime-construction.mjs`, maps in `DESIGN_TRACEABILITY.md` to the `Same KnowledgeRuntime without inversion` acceptance gate.
- Reproducible command: `pnpm verify` from the repository root on 2026-09-10.
- TypeScript evidence: Prettier passed; all 16 TypeScript workspace projects built independently; 51 of 51 Node tests passed, including configuration validation and failure short-circuit tests, CLI/MCP smoke tests, the shared construction smoke, the architecture fixtures, and the real-workspace architecture check.
- Architecture evidence: `pnpm architecture:check` passed for all 17 projects. The shared smoke proves CLI and MCP construct the same `KnowledgeRuntime` contract through `RuntimeBuilder`, while the runtime package only composes explicit configuration and workspace-context dependencies.
- Rust evidence: `cargo fmt --all --check`, workspace build, Clippy with denied warnings, and workspace tests passed; 2 of 2 native analyzer smoke tests passed.
- Failure / recovery evidence: invalid configuration version, runtime mode, and workspace root are rejected before workspace construction; a workspace-construction failure exposes no partial runtime. This in-memory bootstrap creates no Canonical State or published artifact.
- Configuration / schema / migration impact: an in-memory, immutable bootstrap validates config version `1`, `ONE_SHOT`, `MCP_STDIO`, and an explicit workspace root before creating `WORKSPACE_CONTEXT_PLACEHOLDER`. It adds no YAML loading, `.ekp` discovery, database/schema/migration work, provider/plugin invocation, native process, LLM, embedding/vector index, watcher/daemon, HTTP/socket, or knowledge workflow behavior.
- Deferred-scope audit: changed production files were searched for `sqlite|database|yaml|\\.ekp|provider|plugin|native|llm|embedding|zvec|watch|daemon|http|socket|knowledge`; every match was an intentional `KnowledgeRuntime` type/name. `git diff --check` passed for the task worktree, and the P0-W0-003 diff contains no deferred implementation.
- Design documents / traceability / ADRs: `RUNTIME_CONFIGURATION.md` now documents the explicit Phase 0 boundary. No frozen or evolvable design decision changed; no ADR or `DESIGN_TRACEABILITY.md` update is required because the existing P0-W0-003 row already names its fixture, acceptance gate, and governing spec.
- Hosted CI evidence: GitHub Actions run `34462476370` succeeded for head SHA `c04144d32ab228ac5cf2a4859a07468dbe1b8f7e` on branch `codex/p0-w0-001-bootstrap` on 2026-09-10: TypeScript workspace (formatting, build, tests, and architecture check) and Rust workspace (formatting, build, Clippy with warnings denied, and tests) both succeeded. Run URL: `https://github.com/tim-zxy/CodeAtlas/actions/runs/34462476370`. GitHub emitted Node.js 20 deprecation annotations for action internals; these were advisory runner annotations, not mandatory-gate failures.
- Final-review fix-wave evidence: on 2026-09-10, `pnpm verify` passed with formatting, all 16 TypeScript projects built, 52 of 52 Node tests passed, the architecture check covered 17 projects, and Rust formatting, build, Clippy with denied warnings, and 2 of 2 native smoke tests passed; `git diff --check` passed. This adds a direct public `createBootstrapRuntimeDependencies()` freeze regression assertion and synchronizes status-only labels. GitHub Actions run `34475162837` succeeded for head SHA `3b4bee0a91ef55961812120bb31258efa145960e`: TypeScript workspace and Rust workspace both succeeded. Run URL: `https://github.com/tim-zxy/CodeAtlas/actions/runs/34475162837`. Node.js 20 deprecation annotations were advisory runner annotations, not mandatory-gate failures.
- Next task: P0-W1-001 Common IR primitives; it is the next-listed Phase 0 task with no unmet predecessor.

### P0-W1-001 Common IR primitives

- Status: complete.
- Implementation revisions: `c69e5fafb3a453f47aa66c8944f288ae390146e7` (design), `d318b2cc371199f27408996fa65918530a0e3cc0` (task plan), `14e046b712e058f319a2eaa3c2466af69b99e222` and `bed9e88a28509b523014f3f2f0281a888dbf6875` (fixture and edge-case tests), `ea049483e57b071ef236f4b226cafe0537422d61` (identity/reference/range schemas), `01aaf714eb32ad1cea97647ee3e76689e29684a6` (confidence/time schemas), `9c6e64ef1e43bf27073570ca13af50f6a69c1bbd` (strict versioned envelopes), `0a71454bbe48bd533f77e13c8aa313501f87b138` (normative specification), and `35717f35f2ebb9781067b86e9e63e05a77f2dfd1` (padded-schema rejection).
- Governing specification and ADR: `specs/CANONICAL_IR.md`; ADR-002 Provider Independent Canonical IR. Dependency direction remains governed by `specs/MODULE_BOUNDARIES.md`; fresh fixture evidence is required by ADR-012.
- Fixture / Evaluation / Acceptance: `p0-common-ir-v1`, owned by P0-W1-001 in `DESIGN_TRACEABILITY.md`; the acceptance gate is `Canonical primitives and envelopes round-trip`.
- Reproducible local command: `pnpm verify` from the repository root on 2026-09-11. Prettier passed; all 16 TypeScript projects built; the `@codeatlas/ir` type-brand compilation passed; all 94 Node tests passed with zero failures, including 16 valid and 19 invalid Common IR fixture cases; the architecture check passed for 17 projects; Rust formatting, workspace build, Clippy with denied warnings, and 2 of 2 native smoke tests passed.
- Schema / API compatibility impact: `@codeatlas/ir` now exports schema-derived branded `EntityId` and `CanonicalId`, strict `EntityRef`, `SourceRange`, `Confidence`, `ResolutionLevel`, UTC/epoch helpers, strict JSON `SchemaEnvelope`, and typed public failures. P0-W1-001 is exact-version-only: malformed envelopes, unknown strict-object keys, unknown enum values, padded names, non-JSON payloads, and invalid payloads are rejected without coercion or stripping.
- Failure behavior: primitive, envelope, and payload validation raises `IR_VALIDATION_FAILED` with structured paths and bounded messages; schema and version disagreement raise `SCHEMA_MISMATCH` and `UNSUPPORTED_SCHEMA_VERSION` respectively. Typed errors retain no rejected payload, and failed parsing returns no partially typed value.
- Dependency / architecture evidence: `git diff --check` passed; the implementation range from `4753ae2` contains 22 files, 1,801 insertions, and 28 deletions. `pnpm architecture:check` passed for all 17 projects. `packages/ir` imports no `@codeatlas/*` package, and the only new dependency is exact, lockfile-pinned `zod@4.6.1`.
- Deferred-scope audit: changed production code is confined to `packages/ir` schemas, validation, errors, and time helpers. It implements no provider ID, repository/revision/source entity, graph fact, evidence, SQLite/database, IPC, Java, LLM, embedding, network, watcher, daemon, or Knowledge behavior. The only source-related primitive is the required `SourceRange.sourceFileId`; it is not a Source IR entity.
- Documentation / traceability: `specs/CANONICAL_IR.md` now specifies the Common IR executable contract and strict boundary ordering; `DESIGN_TRACEABILITY.md` retains the P0-W1-001 fixture-to-gate mapping. No frozen or evolvable decision changed, so no migration, ADR, or traceability-row amendment is required.
- Final-review correction evidence (2026-09-14; base `d652a765f6089cab5e9265b6e76d6889b335deb3`): strict RED reproduced cycles (5 failures), unsafe/changed output (12 failures plus 2 in-place mutation failures), uncontrolled diagnostics (4 failures), and unstable primitives (9 failures). Focused GREEN passed 6 cycle, 16 output, 4 diagnostic, and 9 primitive checks. `pnpm verify` passed: Prettier, all 16 TypeScript project builds, IR brand compilation, 129 of 129 Node tests, the architecture gate for 17 projects, Rust formatting/build/Clippy with denied warnings, and 2 of 2 native smoke tests. `p0-common-ir-v1` now has 16 valid and 25 invalid cases; the six added invalid JSON cases explicitly exercise negative zero without replacing or weakening any baseline.
- Final-review contract clarification: the JSON boundary rejects cycles with structured paths, final payload output must be JSON-safe and preserve the input JSON value at both envelope entry points, typed errors use fixed messages of at most 128 characters per issue, and negative zero plus explicit `revisionId: undefined` are rejected without normalization. `CANONICAL_IR.md` and the P0-W1-001 traceability row record these compatible schema corrections to the existing round-trip/strict-validation requirements. The Phase 0 acceptance gate and ADR-002 remain unchanged; no migration, version adapter, frozen-decision change, or new dependency is required.
- Final-review architecture / Deferred / recovery audit: `git diff --check` passed; changed production files stay inside `packages/ir` and import no project package. No provider/source/revision entity, graph/evidence, database/SQLite, IPC, Java, LLM, embedding, network, watcher, daemon, or Knowledge implementation was introduced. Validation failure returns no partial value and mutates no canonical or published state. The only runtime package dependency remains `zod@4.6.1`.
- Final-review hosted CI: GitHub Actions run `34794915994` succeeded for correction commit `b18d0221ef92f51a1da502d25245acde3e984ccf` on branch `codex/p0-w1-001-common-ir` on 2026-09-14. Both mandatory jobs succeeded: TypeScript workspace in 29 seconds and Rust workspace in 1 minute 33 seconds. Run URL: `https://github.com/tim-zxy/CodeAtlas/actions/runs/34794915994`. Node.js 20 action-internal deprecation annotations were advisory; all mandatory gates passed.
- Payload-output stability correction (2026-09-14; base `57c659fb659d5eafabf965ed4262ac5c2b1a8983`): both public envelope entry points returned the caller schema's object even after validating its clean JSON representation. A non-enumerable `toJSON` could therefore change the serialized payload. The shared validator now returns the validated JSON output, retaining the existing public generic type and validation order. Two real regression cases first failed on the changed serialized value, then passed with the correction; the combined focused output suite passed 18 of 18 checks.
- Corrective local evidence: `pnpm verify` passed on 2026-09-14: Prettier, all 16 TypeScript project builds, IR brand compilation, 131 of 131 Node tests, the architecture gate for 17 projects, Rust formatting/build/Clippy with denied warnings, and 2 of 2 native smoke tests. `node --test packages/ir/test/common-ir.test.mjs` passed 79 of 79 tests. Fixture `p0-common-ir-v1` remains 16 valid and 25 invalid cases; no baseline or gate changed.
- Corrective audit: `git diff --check` passed. Production changes are limited to the shared payload validator's return value and explanatory comment. No dependency, error precedence, schema version, migration, architecture boundary, canonical/published state, or Deferred capability changed. The existing `CANONICAL_IR.md` JSON-safety/round-trip requirements and `DESIGN_TRACEABILITY.md` P0-W1-001 payload-transformation mapping already cover this correction and remain consistent without amendment.
- Corrective hosted CI: GitHub Actions run `34813847683` succeeded for correction commit `f94a9b3a786821b523c103c7adf28d7fe1a582e7` on branch `codex/p0-w1-001-common-ir` on 2026-09-14. Both mandatory jobs succeeded: TypeScript workspace in 28 seconds and Rust workspace in 1 minute 35 seconds. Run URL: `https://github.com/tim-zxy/CodeAtlas/actions/runs/34813847683`. Existing Node.js 20 action-internal deprecation annotations were advisory; no mandatory gate failed.
- Known limitations: Source/Revision IR, Code Fact IR, Evidence, database/storage, and IPC remain intentionally out of scope for their separately ordered Phase 0 tasks.
- Hosted CI evidence: GitHub Actions run `34572366292` succeeded for head SHA `5db08a485b322bfb20e162d2ec94085a8f428443` on branch `codex/p0-w1-001-common-ir` on 2026-09-11. Both mandatory jobs succeeded: TypeScript workspace in 29 seconds and Rust workspace in 1 minute 49 seconds. Run URL: `https://github.com/tim-zxy/CodeAtlas/actions/runs/34572366292`. GitHub emitted a Node.js 20 deprecation annotation for action internals; it is advisory and not a mandatory-gate failure.
- Next task: P0-W1-002 Source and revision IR. P0-W1-002 and P0-W1-003 are predecessor-valid after P0-W1-001, and P0-W1-002 is first in `WORK_BREAKDOWN.md`.

## Decision reminders

- No Phase 4 exists.
- Use `RuntimeFlow`; do not reintroduce the superseded flow name.
- Do not begin Spring, Knowledge, embedding, or daemon work before the relevant phase gate.
