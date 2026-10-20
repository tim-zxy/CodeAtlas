# Phase 0.5 Read-only Code Query and CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Native/inline is already selected; do not ask again or dispatch implementation subagents.

**Goal:** Deliver usable CLI symbol search, understand and bounded CALL trace over an existing validated Canonical graph.

**Architecture:** Application defines read ports, query policy and result validation. Storage owns parameterized SQLite reads and a single read snapshot, with only IR dependencies; Runtime checks structural port compatibility and owns lifecycle. CLI uses Runtime, never SQLite or concrete Storage.

**Tech Stack:** Existing TypeScript, Node 24, node:sqlite, Canonical IR schemas, node:test and Evaluation Fixture registry; no new dependency or migration.

**Spec:** [Accepted written design](../specs/2026-10-13-p05-code-query-cli-design.md), approved by the user's subsequent “确认” on 2026-10-13.

**Status:** Accepted for preserved Native/inline implementation by the user's subsequent “继续”. The product queries and CLI are being implemented and verified; unchecked acceptance steps remain open. No remote integration or Phase promotion is authorized. Preserve existing dirty work and the accepted D plan. Current progress/evidence is in `.superpowers/sdd/2026-10-13-p05-code-query-cli/progress.md` and CURRENT_STATUS.

## Global Constraints

- One complete feature packet: P05-W5-001 plus read-only P05-W8-001. Index/full/incremental/status remains Phase0.5 work, not completed or deferred here.
- No implicit indexing, Native, source reconciliation/read, migration, network, LLM, knowledge update or semantic trace; no new schema or project dependency edge.
- Caller-required positive safe integers: maxNodes, maxEdges, maxMetadataRows, maxResultBytes, timeoutMs; trace maxDepth is non-negative. No numerical defaults or new quality/performance thresholds.
- Response envelope schema `code-query-result`, version 1; no Canonical/IPC version change.
- Freshness basis `PERSISTED_SOURCE`, worktreeObservation `NOT_OBSERVED`; coverage basis `SUPPORT_SNAPSHOTS`, never complete repository coverage.
- Support R008 through loaded repository manifest latest (currently R010); no migrations on query. Preserve `--smoke` and Phase0 bootstrap.
- Trace is outgoing BFS over CALL only; confidence, resolution and ordered candidates are preserved. Never follow candidates or infer execution ordering.
- Tests/Fixtures/root registration, architecture, failure recovery and fresh evidence remain mandatory. Existing Native admission profiles cannot authorize changed built identity; disclose failures and retain numeric-approval gates.
- No staging, commit, push, PR or merge is authorized by plan/design approval. At a commit checkpoint, record ready-to-review paths; stage only owned files after separate integration authority.

## Review Focus

1. A database path with spaces, symlink resolution or a non-file target must select the explicit existing file safely, not create another database (Task 2).
2. Query results containing astral Unicode or one huge confidence/candidate field must respect UTF-8 budgets before materialization, not JavaScript character counts (Tasks 1–2).
3. Graph activation during a yielded query must not mix old and new facts/support/fingerprint (Task 2).
4. Repeated calls, CLI broken output pipes and cancellation must release listeners/read transactions/connections, without duplicate output or raw exception leakage (Task 4).
5. Multiple Providers and older unchanged-file support must retain provenance without best-provider coverage promotion or stale-snapshot rejection (Tasks 2–3).

## Files and contracts

Create focused files, not scaffolding or a graph framework:

- `packages/application/src/code-query-contract.ts`: strict request/result parsers, error codes, shared control, structural port types.
- `packages/application/src/code-query.ts`: public queries, bounded traversal and response construction.
- `packages/storage/src/queries/code-query.ts`: read-only session, selected context, scoped row decoding and metadata iterators; local typed Storage errors.
- `packages/runtime/src/code-query.ts`: one-shot composition, typed error translation and public type re-exports.
- `apps/cli/src/code-query-command.ts`: argument parsing/command rendering; keep executable dispatch in existing main.ts.
- Corresponding `test/code-query*.test.mjs` files below and one shared test-only `packages/storage/test/helpers/code-query-fixture.mjs` for the entire owned seeded database lifecycle. This helper is part of feature E2E, not a separately delivered prerequisite.
- `fixtures/queries/code-query/fixture.json`, `source/QueryGraph.java`, `inputs/observation.json`, `inputs/patch.json`, `inputs/cases.json`, `expected/graph.json`, `expected/results.json`, `expected/hashes.json`: one discoverable fixture packet. Literal graph/result expectations must be independent of production readers/traversal.
- Modify package indexes, `apps/cli/test/smoke.test.mjs`, root `package.json` required runner and relevant Handoff status/trace/acceptance references only. Do not change architecture allowlists or migrations.

### Shared interface decisions

Implement these names in Task 1; later tasks consume them unchanged:

```ts
type QueryOperation = 'GET_SYMBOL' | 'SEARCH' | 'INCOMING' | 'OUTGOING' | 'UNDERSTAND' | 'CODE_TRACE';
interface QueryBudget {
  maxNodes: number; maxEdges: number; maxMetadataRows: number;
  maxResultBytes: number; timeoutMs: number;
}
type CodeQueryRequest = { repositoryId: EntityId; budget: QueryBudget } & (
  | { operation: 'SEARCH'; name: string; match: 'exact' | 'prefix' }
  | { operation: 'CODE_TRACE'; symbolId: CanonicalId; maxDepth: number }
  | { operation: 'GET_SYMBOL'; symbolId: CanonicalId }
  | { operation: 'INCOMING'; symbolId: CanonicalId }
  | { operation: 'OUTGOING'; symbolId: CanonicalId }
  | { operation: 'UNDERSTAND'; symbolId: CanonicalId }
);
interface QueryControl {
  checkpoint(): Promise<void>;
  reserveText(bytes: number): void;
  chargeMetadataRow(): void;
}
interface CodeReadPort {
  readonly context: CodeQueryContext;
  readNode(id: CanonicalId): Promise<CanonicalNode | null>;
  findNodes(name: string, match: 'exact' | 'prefix'): AsyncIterable<CanonicalNode>;
  readEdges(id: CanonicalId, direction: 'INCOMING' | 'OUTGOING', kind: CodeEdgeKind | null): AsyncIterable<CanonicalEdge>;
  hasOutgoingCall(id: CanonicalId): Promise<boolean>;
  readMetadata(fact: CanonicalFactRef): AsyncIterable<CodeMetadataRow>;
}
```

`CodeQueryContext` fields: repositoryId, revisionId, indexedContentFingerprint (nullable), freshness (`CURRENT | STALE | UNKNOWN`, always with explicit basis/worktree fields). NOT_INDEXED is an error, never a successful context.

`CodeMetadataRow` is a strict union: SOURCE carries parsed SourceFile; SUPPORT carries CanonicalFactRef, parsed Evidence and ProviderFactBinding plus snapshot provenance (id, repositoryId, requestedRevisionId, requestedRevisionFingerprint, startedAt, completedAt, outcome); COVERAGE carries snapshotId, capability, support, capabilityCoverage, sourceFileId nullable, rowId nullable and fileCoverage nullable. Null coverage-row ID means capability-only observation. All scalar identities/times/statuses use existing IR contracts. No raw Provider payload or diagnostics. Repeated rows are budget-charged before deduplicating output; lookup keys include repository/revision.

`CodeQueryPayload` has operation, repositoryId, revisionId, indexedContentFingerprint, freshness, budget, warnings (sorted unique codes), truncation (sorted unique `NODE_LIMIT | EDGE_LIMIT | DEPTH_LIMIT | INCOMING_LIMIT | OUTGOING_LIMIT`), refs and coverage. `refs` contains sorted fact refs, source refs `{sourceFileId, revisionId, path, range}` and Evidence refs `{fact, evidenceId, providerSnapshotId}`; range is nullable and uses existing SourceRange. Coverage is `{basis:'SUPPORT_SNAPSHOTS', observations: CoverageObservation[]}` retaining capability/coverage/provenance values, never an aggregated accuracy score. Operation payloads: GET_SYMBOL `{symbol}`, SEARCH `{symbols}`, INCOMING/OUTGOING `{symbol, edges}`, UNDERSTAND `{symbol, incoming, outgoing}`, CODE_TRACE `{nodes:[{node,depth}], edges}`. Canonical facts are unchanged. Do not add omittedCount estimates.

Public functions: `parseCodeQueryRequest(value:unknown):CodeQueryRequest`, `parseCodeQueryEnvelope(value:unknown):SchemaEnvelope<CodeQueryPayload>`, `createQueryControl(budget:QueryBudget, signal?:AbortSignal):QueryControl`, `executeCodeQuery(request:CodeQueryRequest, port:CodeReadPort, control:QueryControl):Promise<SchemaEnvelope<CodeQueryPayload>>`. Use JSON-compatible type aliases for result records so they satisfy the existing envelope JsonValue constraint without unsafe casts. Implement strict own-key/type checks in Application, reuse IR `SchemaEnvelopeSchema`/primitive/fact parsers, and validate the operation payload separately; no transitive undeclared Zod import. Domain `CodeQueryError` exposes the spec's closed error family and controlled messages.

Application query names are `getSymbol`, `findSymbols`, `getIncomingEdges`, `getOutgoingEdges`, `understandSymbol`, `traceCode`; each takes `(request: corresponding CodeQueryRequest variant, port: CodeReadPort, control: QueryControl)` and returns its matching envelope via the same shared response builder. `executeCodeQuery` dispatches, without a second policy implementation.

Storage's inferred structural session has `context`, the port methods above and `close():void`. Export `openRepositoryCodeQuery(databasePath:string, repositoryId:EntityId, control:QueryControl-shaped-object):Promise<RepositoryCodeQuerySession>`; define its own IR-only structural types without importing Application. Runtime must type-check the session with `satisfies CodeReadPort`. Storage errors have controlled `code`/`message`; Runtime maps only its explicit error class, not arbitrary thrown objects. Shared control failures preserve the Application error class.

`runCodeQuery(input:{databasePath:string; query:CodeQueryRequest}, options?:{signal?:AbortSignal}):Promise<SchemaEnvelope<CodeQueryPayload>>` is the public Runtime entry. Runtime re-exports query request/envelope types, parsers and CodeQueryError for CLI consumption. Database path is a locator separate from Application domain requests.

## Task 1: Contracts and independent query Fixture

**Files:** Create Application contract and `packages/application/test/code-query-contract.test.mjs`; create the single fixture packet and shared Storage test helper above; export contract from `packages/application/src/index.ts`.

**Interfaces:** Produces the shared types, parsers/control/error functions above, literal expectations and test helper `withCodeQueryDatabase(testContext, scenario, callback)` where callback receives `{databasePath, repositoryId, symbolIds, beforeState}`. It uses an owned temporary directory and validated source/analysis application before passing the database locator to tests.

- [ ] **1. Write failing contract and fixture tests.** Assert strict keys, all six operations, exact envelope name/version, invalid opaque IDs/numbers/negative zero, maxDepth=0 allowed, missing budgets refused and unchanged confidence/candidate arrays. Assert an independent literal accepted response round-trips, not a golden generated by the response builder. `createQueryControl` rejects aborted input, UTF-8 retention/metadata overflow and expired cooperative deadline. Review Focus 2: an astral string costs four UTF-8 bytes, not two; boundary plus/minus-one inputs are test data, not global limits.
- [ ] **2. Run RED.** Build dependencies using existing scripts then `node --test packages/application/test/code-query-contract.test.mjs`; require the intended missing contract/behavior failure, not only a stale dist/import failure. Implement exports minimally to let assertion failures prove RED where necessary.
- [ ] **3. Implement contract/control and Fixture.** Use monotonic performance time and async event-loop yield in checkpoint. Retained TEXT bytes and final envelope serialized bytes must each stay within maxResultBytes; they are bounded-state checks, not calibrated RSS. Metadata count is global. Validate fixed output bytes at final response, with no partially published output. Warning codes include WORKTREE_NOT_OBSERVED, REPOSITORY_COVERAGE_UNPROVEN, COVERAGE_UNKNOWN, COVERAGE_OBSERVATION_OLDER_THAN_ACTIVE, PARTIAL_COVERAGE, UNSUPPORTED_COVERAGE, SOURCE_STALE, SOURCE_FRESHNESS_UNKNOWN and INCOMPLETE_RESOLUTION.
- [ ] **4. Implement one owned fixture lifecycle.** Reuse current migration runner only for test setup, registered Repository/source context and `RepositorySourceStateStore.replace` for validated WORKTREE/source records. Existing tests register repository/state rows directly because no registration command exists; retain that narrowly documented setup pattern, never insert Canonical/Evidence/activation rows directly. Use RepositoryAnalysisStage, staged normalize/merge, confirmSucceeded, `applyFullAnalysis` and RepositoryCanonicalFactStore to publish deterministic validated observation data. For legitimate old-support tests use the existing validated patch Application/Store path and literal patch input. Unknown/stale/not-indexed cases use source observations/legacy migration boundaries; corruption uses only explicitly owned negative-control copies. No live Native/admission bypass in query test setup.
- [ ] **5. Verify GREEN and fixture discovery.** `node --test packages/application/test/code-query-contract.test.mjs packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs`; the new fixture must be discoverable as phase0.5/code-intelligence. Inputs and independent expectations cover overloads, all edge kinds, diamond/cycle, unresolved/ambiguous/heuristic and two Providers. Record commands/results; checkpoint owned paths without staging unrelated work.

## Task 2: Read-only Storage snapshot and scoped row mapping

**Files:** Create Storage query file and `packages/storage/test/code-query.test.mjs`; modify `packages/storage/src/index.ts`. Reuse migrations manifest loader and activation-state functions unchanged.

**Interfaces:** Consumes Task1 structural control, Fixture and existing IR. Produces `openRepositoryCodeQuery` and its session, structurally matching CodeReadPort, without Application import.

- [ ] **1. Write failing Storage tests.** Assert get/search/relations against literal graph, scopes and exact mapped fields; invalid source/edge/unresolved/support context returns controlled data error. Include unsupported schema, spoofed workspace user_version, wrong repo, missing active revision, R008 null fingerprint, stale stored WORKTREE, no-fact coverage and old snapshots. Review Focus 1 tests file path with spaces, existing symlink/junction resolved selection where supported, directory/missing/NUL/memory/URI rejection and no creation. Review Focus 3: in WAL test setup, activate a different valid graph on another connection between yielded reads; first request returns entirely old snapshot and next request entirely new. Review Focus 5: two active supports survive and coverage is not promoted.
- [ ] **2. Run RED.** `node --test packages/storage/test/code-query.test.mjs`; save the genuine assertion failures before implementing missing behavior.
- [ ] **3. Implement open/context/close.** Validate locator, existing file, loaded manifest/kind/table/column shape and repository state; read-only connection, extension disabled, query_only, deferred read transaction. Error cleanup rolls back and closes even if validation fails after open. close is idempotent and never commits/writes. Keep selected context from the transaction's first reads. Do not call runMigrations or create TEMP state.
- [ ] **4. Implement parameterized bounded iterators.** Scope every read, including FactEvidence joins, to selected repository/revision. Decode facts with IR schemas, preserve unresolved order and check selected endpoints/source refs. Binary ordering: null qualified name first then qualified name/name/kind/ID for symbols, ID for edges. Exact literal names and prefix via parameterized literal comparison, no wildcard matching. Preflight `length(CAST(column AS BLOB))` for each retained TEXT field before SELECT of its contents; reserve charge then fetch within same snapshot. No `.all()` over adjacency, graph, candidates or support. Validate active Evidence/binding/snapshot consistency; stream Source/support/capability/file coverage. Charge all metadata rows, including rows deduplicated later. Do not reject old supported snapshot fingerprints merely because current WORKTREE advanced.
- [ ] **5. Verify recovery and budgets.** Test huge Unicode/candidate/reasons JSON refuses before text retention, malformed persisted JSON rejects without raw leakage, row overflow and cancellation close all resources. Reopen and compare independently captured canonical/schema/support/source/activation state before/after successful and failed queries. Run `node --test --test-concurrency=1 packages/storage/test/code-query.test.mjs packages/storage/test/analysis-activation-state.test.mjs packages/storage/test/canonical-fact-store.test.mjs packages/storage/test/analysis-patch-store.test.mjs`; all focused tests pass, architecture allowlist unchanged. Record a component checkpoint, not feature completion.

## Task 3: Application queries, provenance and bounded BFS

**Files:** Create `packages/application/src/code-query.ts`, `packages/application/test/code-query.test.mjs`; export functions in existing index. Storage implementation is not imported.

**Interfaces:** Consumes Task1 request/response/control and Task2 structural port. Produces all six Application queries and dispatch as defined in Shared interface decisions.

- [ ] **1. Write failing Application tests with a structural fake port and independent results.** Assert exact symbol/not-found/type behavior, literal name/prefix and overload list, all relation kinds, candidate mentions excluded from resolved incoming, self-edge budget once, incoming-before-outgoing truncation and per-direction indication. Trace goldens pin outgoing BFS order/depth, unique node/edge counts, cycles/diamond, heuristics, no candidate traversal and no non-CALL edges. Test maxDepth0, exact leaf/limit without false truncation, one-more-node/edge truncation, budget-too-small-for-required-root, lookahead and dangling endpoints. Review Focus 5: multiple Providers/old snapshots preserve support and issue exact conservative coverage warnings.
- [ ] **2. Run RED.** `node --test packages/application/test/code-query.test.mjs`; require mismatched declared results, not just missing dist files.
- [ ] **3. Implement minimal query policy.** Use queues/Sets, never a generic traversal engine. Validate requests before port use. Get/root must be TYPE or SYMBOL; traversed targets may be any valid Canonical node. Incoming then outgoing ID order; count unique self-edge once. Trace expansion enqueues resolved targets once, root depth0; inspect bounded existence at depth limit. Node-limit omits the edge needing an unadmitted endpoint and stops; edge-limit stops only with real additional work. Close partially consumed iterators using normal async-iteration/finally semantics; do not scan remaining graph to count omissions.
- [ ] **4. Implement shared metadata/result builder.** Gather only returned facts, deduplicate fact/source/Evidence/coverage keys and sort explicitly; no locale sort. Require at least one valid active support per selected fact. Preserve exact confidence and ordered candidates. Coverage observations remain scoped to support snapshots, always REPOSITORY_COVERAGE_UNPROVEN/WORKTREE_NOT_OBSERVED; stale/unknown/old/partial/unsupported/missing observation warnings follow the spec. No fabricated statistics. Validate final strict envelope and UTF-8 bytes before returning; no partial success on metadata/byte overflow, timeout, cancellation or invalid port output.
- [ ] **5. Verify GREEN.** `node --test --test-concurrency=1 packages/application/test/code-query-contract.test.mjs packages/application/test/code-query.test.mjs packages/storage/test/code-query.test.mjs`; pass all literal goldens and permutations of observation insertion order. Record evidence and checkpoint owned paths, not CLI or whole-phase completion.

## Task 4: Runtime lifecycle and actual CLI routes

**Files:** Create Runtime composition and `packages/runtime/test/code-query.test.mjs`; create CLI command file and `apps/cli/test/code-query.test.mjs`; modify Runtime index, CLI main and smoke test.

**Interfaces:** Consumes `executeCodeQuery`, control, Storage session. Produces public `runCodeQuery` signature above and existing `runCli(args?:string[]):Promise<number>` routing. Re-export Application contract types/parsers/errors through Runtime for CLI; no app IR/Storage import is necessary.

- [ ] **1. Write failing Runtime and CLI tests.** Runtime rejects invalid domain requests before opening, preserves shared snapshot, translates only controlled Storage errors, closes on every outcome and never calls Native/migration/update/index. CLI processes exact understand-by-name/by-ID/trace commands with required flags; compare parsed stdout to independent result goldens and exact error/exit behavior. SIGINT maps to130; unknown/duplicate/partial/malformed numeric arguments fail2 before DB access. Smoke remains exact codeatlas-cli:ready. Update the old unsupported-empty-invocation test to the approved usage error contract, not to silence a failure.
- [ ] **2. Run RED.** `node --test --test-concurrency=1 packages/runtime/test/code-query.test.mjs apps/cli/test/code-query.test.mjs apps/cli/test/smoke.test.mjs`; new routes must expose the original unimplemented behavior before implementation.
- [ ] **3. Implement Runtime composition.** Parse first, create one control, open Storage once, assert structural compatibility, dispatch and finally close. No bootstrap object mutation/public Native REFRESH export. Preserve typed cancellation/deadline/budget errors. Bound safe messages; unknown OS/SQLite exceptions become DATABASE_UNAVAILABLE or QUERY_DATA_INVALID at the owning boundary, without copying paths/raw messages.
- [ ] **4. Implement CLI parser and renderer.** Use Node facilities, strict duplicate/unknown validation and decimal safe-integer parsing with no coercion from exponents/hex/whitespace/-0. Exactly one symbol/name; match only for name, maxDepth only for trace. --help documents existing graph, explicit budgets and freshness/coverage/cooperative-timeout limits. Await stdout write/backpressure completion before exiting; successful JSON plus LF only, errors JSON on stderr only. UTF-8 maxResultBytes applies to envelope bytes, LF delimiter excluded. Treat output failure as failed delivery, not a successful exit; clean listeners on all paths.
- [ ] **5. Verify lifecycle including Review Focus 4.** Repeated in-process runCli calls restore SIGINT/output listener counts; injected failing output sink and real CLI process pipe closure do not leak resources or print raw exceptions. Cancellation tests drive a known owned large fixture and wait for query execution readiness in the test harness rather than arbitrary sleep; platform signal differences are explicit, not hidden as product success. Focused commands from Step2 pass, and persisted state matches before/after CLI runs. This is the first product delivery checkpoint; full acceptance still needs Task5.

## Task 5: Whole feature packet acceptance and review

**Files:** Register five query test files plus contract test in root `package.json` test list (retain all existing runners); add `packages/evaluation/test/code-query-fixture.test.mjs`; update `docs/handoff/CURRENT_STATUS.md`, `DESIGN_TRACEABILITY.md`, `WORK_BREAKDOWN.md`, `PHASE_ACCEPTANCE.md` and `PHASE05_FUNCTIONAL_DELIVERY_REVIEW.md` with actual evidence and remaining scope.

**Interfaces:** Consumes Tasks1–4 public Runtime/CLI results and independent Fixture; produces required registered evidence, not a new production API/profile.

- [ ] **1. Write failing registration/Fixture test.** Discover exactly the new Fixture ID through existing registry; validate declared artifact hashes independently; compare public Runtime and actual CLI results against literal goldens. Confirm runner includes every new suite and retains previous required entries. No expected results generated by the feature itself, hidden skip or diagnostic admission preload.
- [ ] **2. Run RED then implement registration.** `node --test packages/evaluation/test/code-query-fixture.test.mjs scripts/test-workspace-structure.mjs`; prove missing entry/declared artifact failures first, then add only necessary fixture/root test registration. Existing manifest exact keys and architecture dependency allowlists stay unchanged.
- [ ] **3. Run complete feature regression.** Build before each dist-based suite; run serially contract/Application/Storage/Runtime/CLI/Evaluation query tests, existing smoke/runtime construction, registry and architecture tests. Run architecture checker and injected forbidden-edge tests. All query-packet cases pass; capture command, Node/environment, exit, pass/fail/skip, fixture hash and source identity in owned logs.
- [ ] **4. Run declared repository gates without bypass.** `pnpm verify` (format, build, normal required root, architecture, Rust fmt/build, Native client/handshake/analysis/memory, Clippy and Cargo tests) is the controlling gate set. Because its `&&` chain stops on failure, record that failure and independently run later declared commands to report actual coverage; never imply they executed from the stopped chain. Known missing exact-build profiles remain failures, not waived passes. Do not use pnpm automatic install as a formatting workaround: if the package-manager sandbox fails, use verified existing local Node/Prettier/TypeScript entry points for equivalent diagnostics, reporting limitations and seeking narrowly scoped tool approval where required. No dependency/network install in this task.
- [ ] **5. Review the complete packet, then synchronize evidence.** Native implementation uses executing-plans and one whole-packet correctness/security/architecture review after verification, not per-helper review delivery. Follow its reviewer mechanism when available; record unresolved findings honestly. Record local feature completion separately from whole-root/Phase/integration state. Keep indexing and D5/E parent work open; no Phase exit is checked merely from component tests. If fresh full declared gates remain blocked by exact-build calibration, report that blocker and request separately approved measurement/numeric work before claiming unconditional task completion. Do not lower thresholds, copy old profiles or enable product admission.

## Dependencies and execution checkpoints

Task1 precedes Tasks2/3; Task2's complete port and Task3's policy precede Task4; Task5 accepts the full packet. Native execution is sequential to avoid shared-interface churn. No safe implementation parallelism is requested. Tests may isolate owned cases, but no arbitrary concurrent SQLite/session mutation in the product.

At execution start re-read AGENTS/Handoff authorities, accepted spec and this plan, confirm linked worktree/current dirty ownership, active Canonical Store predecessor and absent CodeGraph status. Declare assumptions and success criteria before code. Use TDD, apply_patch and focused diffs. Don't issue broad cleanup, branch switching or remote actions.

After packet closure, resume retained D5 complete replay/final-build calibration/holdouts/separate numeric approval, then indexing CLI and P05-W9 Evaluation. Built Storage/Runtime changes alter Native profile identity; finish relevant product changes before final calibration, without treating the required failures as passed.

## Plan self-review and handoff

All design sections map to Tasks1–5: contracts/budgets1, database/snapshot/IR/support2, symbol/relations/trace/coverage3, public lifecycle/CLI4, Fixture/root/architecture/evidence5. Review Focus cases are assigned explicitly. Structural Storage/Application compatibility is checked by Runtime, with no new dependency edge. No placeholder default or numeric threshold, no new migration, no early DEFERRED capability and no implementation checkbox is marked complete. Symbol overload selection, leaf lookahead, Unicode bytes, old support, source freshness and cooperative cancellation remain explicit limitations rather than inferred behavior.

Next gate: user reviews this written plan. On approval, use the preserved Native/inline method with executing-plans and implement the complete feature packet; do not ask for execution-mode selection again. This planning turn makes no fresh runtime/build/root/Rust/profile or hosted result claim.
