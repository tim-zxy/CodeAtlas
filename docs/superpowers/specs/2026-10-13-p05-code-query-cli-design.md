# Phase 0.5 read-only code queries and CLI design

Date: 2026-10-13. Status: **written design accepted** by the user's subsequent “确认”. The [implementation plan](../plans/2026-10-13-p05-code-query-cli.md) now awaits its own review before coding. Native/inline execution preference is retained. No implementation, integration, migration or Phase acceptance is claimed.

## Intent and scope

Deliver one useful end-to-end feature packet: an existing validated repository Canonical graph can be searched and understood from the CLI, and a selected symbol can be traced through bounded CALL relationships. This completes P05-W5-001 functionality and the read-only portion of P05-W8-001 together; it is not another private test-helper milestone.

The existing active Canonical Store is the predecessor. Native REFRESH admission is not a query dependency. Its absent reviewed profiles, D4/D5/D6, replay qualification and Evaluation gates remain mandatory before indexing release. Full/incremental/status index CLI remains required **within Phase 0.5**, not deferred to another phase or counted complete here.

Excluded: implicit scan/reconciliation/indexing, Native invocation, knowledge compilation/publication, Agent API implementation, LLM, framework semantics, cross-repository queries, execution ordering, ExecutionGraph/RuntimeFlow/BusinessFlow, new schema, vector/FTS indexes and a general-purpose graph engine. No numerical quality or performance gate is added.

## Evidence and approach

The [functional review](../../handoff/PHASE05_FUNCTIONAL_DELIVERY_REVIEW.md) records the actual missing product routes and prior reproducible checks. Source inspection confirms:

- CLI `apps/cli/src/main.ts` routes only `--smoke`; Runtime `KnowledgeRuntime` holds bootstrap configuration and placeholder workspace context only.
- Storage R004 stores Canonical nodes, edges and separate unresolved hints/candidates. R005 separates Evidence and bindings; R003/R006 retain snapshot capabilities and coverage. R008 adds the active fingerprint. R009/R010 are not necessary for read-only graph traversal.
- `readAnalysisFreshness` compares indexed fingerprint against the persisted revision, not current disk contents. Mutable WORKTREE identity alone cannot prove freshness.
- Storage writes via validated Application/Store activation; the query must not reconstruct facts from Provider payloads or private replay comparators.

Approaches considered: (1) recommended bounded reads through Storage ports, Application policy and Runtime lifecycle; (2) CLI directly reads SQLite, rejected by MODULE_BOUNDARIES; (3) finish indexing and automatic workspace discovery first, valid later but delays the requested useful read-only workflow and adds unrelated admission dependencies. Choose (1), using existing schemas, parameterized SQL and Node facilities, without new dependencies.

## Layer ownership and composition

`CLI -> Runtime -> Application query functions -> declared read port -> Storage -> existing SQLite`.

- Application defines provider-independent requests/results, the minimal structural read-port contract, query policy and traversal. Follow existing function-plus-ports style in `apply-full-analysis.ts`; no one-product factory or generic query DSL.
- Storage structurally satisfies that declared persistence port, maps SQL rows into existing IR schemas, and owns opening/closing the read-only connection and snapshot. It exposes no DatabaseSync to CLI or Application. Keep Storage dependent only on IR: no Application import, including type-only imports. Runtime performs the structural TypeScript compatibility check against the Application port. This preserves the actual architecture allowlist without broadening it.
- Runtime exposes a one-shot code-query composition entry, supplies the Storage adapter and cancellation, and closes owned resources in finally. Do not alter Phase 0 bootstrap's immutable placeholder configuration merely to attach a database.
- CLI parses arguments, invokes Runtime and renders results/errors. No concrete Storage import, SQL, source discovery or Native client access in apps.

Public names and file names are proposed, not claims of existing APIs: Application `getSymbol`, `findSymbols`, `getIncomingEdges`, `getOutgoingEdges`, `understandSymbol`, `traceCode`; Runtime `runCodeQuery`; Storage a focused repository code-query adapter. Implementation may consolidate files while keeping these behaviors and boundaries.

## Explicit database and revision selection

Use required `--database <existing-path>` and `--repository <opaque-id>` for this packet. Resolve a relative path against the invocation working directory; reject NUL, padded/blank paths, memory databases and URI-shaped locators. Resolve/check an existing regular file before opening, then pass its resolved path to Storage. An explicitly chosen local database may lie outside the workspace; this does not grant access to raw source or other files. Do not create `.ekp`, discover arbitrary databases, follow a stored source path, or rewrite repository roots/IDs. Automatic `.ekp` discovery remains later Runtime/CLI work under the existing configuration spec.

Open with Node SQLite read-only mode, extension loading disabled, and connection-local query-only protection. No migrations, backup, journal-mode change, checkpoint, TEMP stage or write transaction. Read-only queries may use an already existing WAL under SQLite rules; if it cannot be read safely, return a controlled error, not a repair attempt. Prove canonical data/schema preservation, rather than promising SQLite never uses OS locks or shared-memory facilities.

Load the existing repository migration manifest to determine supported schema versions without applying it. Support R008 through the current manifest latest (currently R010); reject older databases with `DATABASE_UPGRADE_REQUIRED` and newer ones with `DATABASE_TOO_NEW`. Validate required table/column shape and repository database kind, not user_version alone. Workspace databases, absent repository/state and invalid persisted rows fail explicitly.

All reads for one request share one deferred read transaction/snapshot. Select exactly the stored repository ID and its active indexed revision; historical revision selection is out of scope. A missing active revision is `NOT_INDEXED`, not successful empty search. A non-null legacy revision with null fingerprint may return its graph with UNKNOWN freshness. A missing referenced revision is invalid storage, not a invented empty graph. Bind repository AND selected revision on every fact/source/Evidence lookup; never use opaque ID alone across context.

## Requests, results and bounded reads

Every request supplies explicit positive safe-integer `maxNodes`, `maxEdges`, `maxMetadataRows`, `maxResultBytes` and `timeoutMs`; trace also supplies non-negative safe-integer `maxDepth`. No arbitrary default resource values are introduced. Tests may use literal limits as inputs, not new acceptance thresholds. Application callers additionally accept AbortSignal; CLI maps SIGINT to cancellation and removes its handler on completion.

Results use the existing strict version-1 envelope mechanism with schema name `code-query-result`; this is a query response contract, not a Canonical IR or Native IPC version change. Request variants are get/search/incoming/outgoing/understand/trace. Results contain operation-specific payload plus:

- repository ID, selected revision ID and indexed fingerprint (nullable for legacy state);
- freshness `{state, basis: 'PERSISTED_SOURCE', worktreeObservation: 'NOT_OBSERVED'}`;
- stored coverage observations, their snapshot provenance and explicit coverage limitations;
- controlled warning codes, fact/source/Evidence references, requested budgets and truncation reasons.

Facts retain their existing IR confidence score/method/reasons, SourceRange, target state/resolution and ordered candidate array without coercion. Nodes do not gain invented resolution. Reference coordinates remain zero-based UTF-8 bytes; source references include revision, logical path and source-file ID, not raw file contents. Return no arbitrary Provider payloads, unrestricted diagnostics, host environment, stack or raw source. Compilation currency is not applicable to code facts and is omitted, not simulated.

Return complete validated facts, not partially truncated confidence/candidate fields. Preflight SQL TEXT byte lengths before materializing large JSON, use bounded row iteration rather than graph-wide `.all()`, and account for retained metadata and final UTF-8 envelope bytes. If even one required fact or the fixed envelope cannot fit, fail `QUERY_BUDGET_EXCEEDED`. If an otherwise valid graph has more nodes/edges than allowed, return a bounded result with explicit truncation. Byte/metadata exhaustion fails atomically rather than silently dropping provenance. Bounds limit returned/materialized state; they are not a claimed calibrated RSS reservation or a hard CPU limit for SQLite sorting/scans. No complete adjacency or whole-graph preload.

Check deadline/cancellation before opening, between reads/traversal steps, after cooperative event-loop yields and before handing off a result. Node synchronous SQLite calls cannot promise mid-statement preemption; timeout is cooperative and this limitation must be documented. On timeout/cancellation/storage validation failure, expose no partial success; rollback the read transaction and close. Use a single shared budget across node, edge, support and coverage reads, not one allowance per node.

## Symbol and relation semantics

- `getSymbol` accepts a CanonicalId and returns one TYPE or SYMBOL in the selected active revision; other kinds or absence yield `SYMBOL_NOT_FOUND`.
- `findSymbols` searches TYPE/SYMBOL by literal case-sensitive exact name or qualified name, or explicit literal prefix mode. Default mode is exact. No wildcard interpretation, fuzzy ranking, ID parsing or auto-selection of an overload. Sort by qualified name (null first), name, kind and ID using explicit binary comparison, never locale-dependent order. Use maxNodes plus one bounded lookahead to detect truncation.
- `understandSymbol` returns the selected fact and bounded incoming/outgoing edges of the existing five IR edge kinds. Incoming means RESOLVED target ID equals selected ID; outgoing means source ID equals selected ID. Unresolved candidate mentions are not incoming resolved relationships; report this interpretation in the result.
- Process incoming then outgoing deterministically by edge ID; a self-edge may appear in both direction views but counts once against the unique-edge budget. Endpoints are Canonical refs, not an unbounded recursive expansion. A direction cut by the shared limit reports its own truncation. Confidence is stored fact confidence, never recomputed by the reader.

Validate selected facts/edges with existing Canonical schemas, unresolved JSON with CanonicalTarget shape, and referenced endpoints/source-file context in the same snapshot. Reject malformed, dangling or cross-context selected data as `QUERY_DATA_INVALID`; do not repair it or run an unbounded whole-database audit.

## Deterministic bounded CALL trace

Trace is outgoing breadth-first traversal from an explicit TYPE/SYMBOL ID, labeled `CODE_TRACE`. Root depth is zero and consumes one node. Only CALL edges are considered, ordered by edge ID within each expanded node. BFS order is a presentation/traversal order, **not execution order or causal sequence**.

Count unique nodes and edges globally. Expand each discovered node once; retain self/cycle edges without re-enqueuing visited nodes. Preserve EXACT and HEURISTIC resolved targets and their confidence. Unresolved/AMBIGUOUS/UNSUPPORTED CALL edges are terminal facts with original hints/candidates; never follow or promote candidates. Query a target before admitting a resolved edge; dangling target fails. If a new target would exceed maxNodes, omit that edge and stop traversal with NODE_LIMIT so the returned trace contains no unexplained resolved endpoint. Edge-limit exhaustion similarly stops with EDGE_LIMIT. Depth-bound nodes are not expanded; bounded existence lookahead distinguishes a real DEPTH_LIMIT omission from a leaf. Lookahead is not retained graph output and is charged to read/deadline budgets.

Do not truncate at exactly a limit unless actual omitted work exists. Multiple independently encountered depth cuts may be reported; once a global node/edge limit stops traversal, do not scan the rest merely to count omitted facts. `omittedCount` remains unknown, not a guessed number. Trace of a valid isolated root is successful; unknown root and missing graph are typed errors.

## Evidence, coverage and freshness

For each returned fact, join FactEvidence to same-repository/same-revision ACTIVE Evidence and its valid snapshot/binding context. Return bounded references separately from Canonical facts, preserving provider-independent IR. Missing required support or contradictory bindings is invalid data, not confidence-zero success. Snapshot provenance may predate the active fingerprint after a legitimate unchanged-file incremental refresh; do not discard that support or label its old snapshot coverage current by equating revision IDs.

Coverage is explicitly `SUPPORT_SNAPSHOTS`, not complete active-repository coverage. Read capability and applicable file/global coverage rows only for snapshots supporting returned facts, sorted by snapshot/capability/source file/row ID; preserve status and support without taking a best-provider maximum. Keep snapshot requested fingerprint in provenance. Always warn `REPOSITORY_COVERAGE_UNPROVEN`: supporting facts do not prove coverage of omitted/no-fact files. Old-fingerprint observations receive `COVERAGE_OBSERVATION_OLDER_THAN_ACTIVE`; absent observations warn `COVERAGE_UNKNOWN`; non-complete/unsupported observations remain explicit. No fabricated counts/precision/recall from persisted qualitative rows. This conservative contract does not modify indexing coverage persistence or the later full Phase Evaluation.

Reuse `readActiveAnalysisState` and `readAnalysisFreshness` within the request snapshot, subject to validating persisted row context. Return CURRENT only with the explicit PERSISTED_SOURCE basis; always warn `WORKTREE_NOT_OBSERVED`. STALE and UNKNOWN graphs remain readable with corresponding warnings, never automatically reconciled. No timestamp or stored root becomes a claim that live disk matches the graph.

## CLI contract

Preserve `--smoke`. Product commands are:

```text
codeatlas understand --database <path> --repository <id> --symbol <canonical-id> <budgets>
codeatlas understand --database <path> --repository <id> --name <literal> [--match exact|prefix] <budgets>
codeatlas trace --database <path> --repository <id> --symbol <canonical-id> <budgets> --max-depth <n>
```

`<budgets>` expands to required `--max-nodes`, `--max-edges`, `--max-metadata-rows`, `--max-result-bytes`, `--timeout-ms`. Select exactly one of symbol/name for understand; name produces a bounded match list for explicit subsequent selection, not an arbitrary chosen overload. Trace requires symbol; no semantic trace mode. Reject duplicate/unknown/missing options and malformed numbers before database access. `--help` explains the two understand variants, budget requirements and existing-graph prerequisite.

Use deterministic JSON envelope output on stdout, including successful truncated results and warnings; diagnostics go only to stderr. No additional text formatter or output library in this packet. Exit 0 for valid results including bounded truncation; exit 2 for usage; exit 1 for typed query/storage/deadline failures; exit 130 for cancellation. Error stderr is controlled JSON `{code,message}` with safe remediation, never raw SQLite/path/source exceptions. Exact-match search with no matches is valid empty SEARCH, distinct from SYMBOL_NOT_FOUND and NOT_INDEXED.

Error family: INVALID_QUERY, DATABASE_UNAVAILABLE, DATABASE_KIND_MISMATCH, DATABASE_UPGRADE_REQUIRED, DATABASE_TOO_NEW, REPOSITORY_NOT_FOUND, NOT_INDEXED, SYMBOL_NOT_FOUND, QUERY_DATA_INVALID, QUERY_BUDGET_EXCEEDED, QUERY_TIMEOUT, QUERY_CANCELLED. Preserve underlying error privately only when safe; do not convert database errors into empty success.

## Fixtures and acceptance

Implementation must add one query/CLI Fixture packet and register it with the existing Evaluation Fixture contracts and required test entry, not invent an alternative registry. Proposed location `fixtures/queries/code-query/fixture.json` is not yet created/registered; category is `code-intelligence`, phase is `0.5`, using the existing exact manifest fields. Supply source and independent literal graph/result goldens, hashes as input/expected artifacts and instructions consistent with `fixture-manifest.ts` / `fixture-registry.ts`; do not add unsupported hash fields to the manifest. Seed good databases through the existing validated full/patch Application and Store workflows, without direct SQL expected-fact insertion or bypassing Native admission. A validated deterministic Provider observation can seed query tests without running Native; real Native correctness stays covered by its retained gates. Corruption tests may mutate only owned copies explicitly as negative controls.

| Check | Reproducible acceptance |
| --- | --- |
| Exact lookup/search | Overloads, TYPE/SYMBOL distinction, literal wildcard-like names, case, prefix, ID and repository/revision isolation against independent goldens. |
| Relations | All five kinds; self edges; resolved incoming versus unresolved candidate mentions; exact confidence, ordered candidates, source coordinates and support refs. |
| CALL trace | Branch, diamond, cycle, isolated root, unresolved/ambiguous/heuristic targets; same result after input insertion-order changes; every node/edge/depth boundary and real truncation lookahead. |
| Metadata and bytes | Huge JSON/Unicode, many support rows, byte boundary, metadata boundary; refusal before unbounded retention, no partial facts or silent lost evidence. |
| Context and coverage | R008 legacy unknown, stale same-WORKTREE ID, not indexed, no-fact coverage limitation, old support snapshots after legitimate incremental activation; no implied current-disk/complete coverage. |
| Read snapshot/recovery | Concurrent activation never yields mixed revisions; cancellation/deadline/error closes connection and read transaction; reopened active data/schema/Evidence/bindings/fingerprint exactly unchanged. |
| Product E2E | Actual CLI processes understand-by-name, understand-by-ID and trace; valid result envelope, errors/exit codes, stdout/stderr separation, missing file creates nothing, no implicit migration/Native/update/index call. |
| Architecture/security | Apps never import Storage/SQLite, Application never imports concrete database/Providers; no dependency cycle, source read/network/LLM/extension execution or secret error leakage. |

Run new focused Storage/Application/Runtime/CLI tests, fixture registry and architecture injected-boundary tests; register and run them in normal root regression. Build/type/format/architecture plus the repository's declared verification gates remain required. Disclose known Native profile failures after new built identity rather than disabling them or asserting whole-root success. If a boundary fails because of implementation, fix it; if design changes are necessary, use governance before weakening any test.

Existing Phase0.5 Symbol Recall >=95%, Direct Call Precision >=95%, Recall >=90%, declared incremental correctness 100%, stale bindings 0 and performance-report scenarios are unchanged. Query fixture success proves this packet, not these whole Phase exits. Do not tick Phase Acceptance before fresh declared evidence and review.

## Delivery order and governance

After written-spec approval, create one executable plan: (1) response/read-port contract and independent fixture, (2) Storage snapshot/row mapping, (3) Application search/understand/traversal/budgets, (4) Runtime lifecycle and actual CLI routes, (5) whole-packet E2E, failure checks, required registration, evidence and review. Test small implementation steps, but deliver the complete packet, not individual prerequisites as product milestones. Native execution choice remains in force; no separate re-selection is needed.

Then resume the retained Native admission/complete replay/calibration work against stabilized built sources, followed by full/incremental/status CLI and P05-W9-001 Evaluation. Existing exact-build profiles cannot be transplanted across changed Storage/Runtime code. Separate numeric approval remains required.

No FROZEN conflict or schema/IR semantic change is proposed, so no new ADR is required for this additive read-query design. Explicit database arguments are a scoped compatibility entry, not replacement of future `.ekp` discovery. Any implementation need to alter identity, source semantics, frozen activation, migration or module boundaries stops for ADR/Design Change Proposal. No DEFERRED capability moves forward. Related Handoff status/work-breakdown/traceability links record accepted design and pending plan review, not completed implementation.

Self-review: scope is one public read-only packet; source evidence and missing capabilities are distinguished; no placeholder implementation or arbitrary default threshold; candidate ambiguity, snapshot freshness, coverage lineage, truncation, lifecycle, budget limitations and known retained failures are explicit. Written design review has passed; written-plan review is the next gate. No code is authorized merely by either file's existence.
