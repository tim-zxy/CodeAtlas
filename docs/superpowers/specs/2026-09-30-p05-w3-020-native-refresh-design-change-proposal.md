# P05-W3-020 Native REFRESH startup review and design change proposal

Status: PROPOSED on 2026-09-30; not accepted and not implementation-ready.

## Outcome and baseline

Start the next existing Phase 0.5 task, not Phase 1 or a new architecture.
Implement restart-safe Java incremental analysis through the existing Provider,
Canonical normalization, FactMerger, and validated atomic Apply path. Preserve
all original Phase 0.5 gates and the accepted same-`WORKTREE`-ID restriction.
No product code, SQL migration, executable Fixture, or accepted wire contract is
changed by this proposal.

PR #16 is merged at `84975b780f47807fb5f8fcfb616c48fc1001ca6e`.
The primary local `main` and this design branch start at that commit. The exact
merge-SHA [push run 36717188345](https://github.com/tim-zxy/CodeAtlas/actions/runs/36717188345)
succeeded. P05-W2-010 and P05-W1-011 are now integrated: 10/14 Phase 0.5 tasks,
with P05-W3-020, P05-W5-001, P05-W8-001, and P05-W9-001 remaining. This is not
Phase 0.5 exit evidence.

Reproducible predecessor check at the merged tree:

```powershell
git rev-parse HEAD
node --test --test-concurrency=1 packages/application/test/change-detector.test.mjs packages/application/test/reconcile-worktree.test.mjs packages/storage/test/analysis-patch-store.test.mjs packages/runtime/test/patch-analysis-composition.test.mjs
```

The command passed 8/8 on 2026-09-30. It covers source reconciliation,
synthetic REFRESH composition and failure retention, and the patch Fixture case
index. The case-index test is not the complete atomic-store behavior suite;
the latter resides in `packages/storage/test/canonical-fact-store.test.mjs`.
PR #16's head and merge CI supply the broader predecessor verification. There
is still no real Rust REFRESH test result.

## Authority and implementation evidence

Read this with ENGINEERING_HANDOFF, CURRENT_STATUS, DESIGN_AUTHORITY,
IMPLEMENTATION_PROTOCOL, ROADMAP, WORK_BREAKDOWN, PHASE_ACCEPTANCE,
DESIGN_TRACEABILITY, DEFERRED_DECISIONS, Native IPC, Provider SPI, Canonical IR,
SQLite Schema, Runtime Configuration, Evaluation, Security, ADR-002/003/004,
ADR-010/011/012/014/015, and the Native Analyzer Scalability specification.

| Evidence | Current result | Consequence |
|---|---|---|
| `crates/native-analyzer/src/protocol.rs`, `serve_once_impl` | One request per process; ANALYZE dispatch exists, v2 REFRESH is explicitly rejected, other requests go through DESCRIBE validation | REFRESH production is unimplemented, not a completed capability |
| `crates/native-analyzer/src/analyze.rs`, `run_relations` | Builds a declaration/import/inheritance index from the full source list, then reparses it for relations | Reusing this full pass on every refresh would violate the no-default-full-reparse gate |
| `language.rs`, `SymbolFact` and `RelationSite`; `relation_index.rs`, `DeclarationIndex` | Resolution needs signatures, static flags, import variants, inheritance and unresolved site hints | Canonical nodes or resolved edges alone cannot reconstruct this input after restart |
| `packages/ir/src/provider-code-fact.ts` | Strict ProviderNode has no signature/static/analysis-state extension | Do not add language metadata to Provider or Canonical IR v1 silently |
| `packages/providers/src/native-ipc.ts`, `RefreshRequestPayloadSchema` | Strict v1 carries the delta and base/target context, but no retained declaration/site state or ownership inventory | A fresh Rust child cannot calculate a complete, restart-safe patch from this request alone |
| `packages/providers/src/staged-patch.ts`, `normalizeStagedPatch`; Storage `patch-stage.ts` | SOURCE_FILE events must exactly match added/modified sources; unchanged source/node lookup is supported | Keep source changes separate from dependency re-resolution; unchanged-file edge updates need not fake source changes |
| Runtime `patch-analysis.ts`; Storage `canonical-fact-store.ts` | Successful verified terminal is required before normalization/Apply; base validation, support reselection and rollback exist | Reuse this path, extending it only for the approved metadata contract |
| `native-client.ts`, `NATIVE_CLIENT_HARD_LIMITS` | Bounded stdin/lines/stdout/events/stderr, checksum, timeout and cancellation already exist | New input/output metadata must remain bounded and fail closed; do not loosen caps by assumption |
| `fixtures/native/java-call-basic/fixture.json`, restart-reconciliation and patch case manifests | Full-analysis and synthetic patch/restart evidence exists | Real Native incremental and dependency-change Fixtures are still missing |

Framework semantics remain in Plugins. No Spring, second language, Wiki,
Knowledge compilation, adaptive scheduler, or persisted AST is needed here.

## Decision requiring approval

ADR-010's negotiated strict IPC/storage boundary and ADR-015's v2 ANALYZE-only
decision are FROZEN. ADR-014 already permits versioned provider compatibility
metadata and restart reconstruction without ASTs, but supplies no executable
metadata contract. This proposal adds one; it does not authorize extra v1/v2
fields, v2 REFRESH, Rust SQLite access, or cross-revision carry-forward.

Recommended approach: **a negotiated protocol v3 plus a separately versioned,
TypeScript-owned, derived per-file Native analysis-state store**. Keep IR v1,
ProviderSnapshot v1, and existing v1/v2 clients unchanged. Both full ANALYZE and
REFRESH need the new contract: a successful full analysis must establish the
state that subsequent one-shot REFRESH processes consume.

Alternatives:

1. Process-local cache only: smallest runtime change, but cannot satisfy restart
   correctness; retaining a daemon alone does not solve the missing baseline.
2. Rebuild from current Canonical rows only: no new metadata store, but loses
   signatures, imports and unresolved dependency hints; not adequate evidence
   for declaring incremental equivalence.
3. Versioned derived summaries (recommended): preserves the existing boundaries
   and one-shot child model, at the cost of an explicit protocol and additive
   storage extension. It must be evaluated rather than claimed scalable now.

## Proposed design boundaries

### Retained analysis state

Persist compact extraction summaries, not source bytes or ASTs: source ID/path
and fingerprint; declaration identities and resolver-required attributes;
relation sites including unresolved/ambiguous hints and source spans;
imports/inheritance; categorical and site-count coverage; bounded diagnostics;
previous emitted Provider identities and deterministic content digests; explicit
file ownership, including shared synthetic package-container ownership.

The state header binds repository, mutable revision ID, active fingerprint,
Provider identity/version, grammar/analyzer/resolver/summary compatibility
versions, capabilities and semantic source-policy/configuration fingerprint.
Worker count is not a semantic compatibility discriminator. State availability
is distinct from graph freshness. Never reconstruct missing summaries by
inventing facts from current merged Canonical representatives.

TypeScript owns persistence, staging and validation. Rust receives validated,
versioned metadata, never a Canonical database handle or database path.
Proposed additive R010 stores derived state; existing R001-R009 checksums stay
unchanged. Acceptance would move the unpublished Phase 1 execution/runtime-flow
reservations to R011/R012, not implement either feature. No migration number or
manifest is changed before approval.

### Versioned transport and atomic publication

Propose v3 JSONL input with one request header, bounded summary records and one
completion record, with exact sequence/count/context/digest verification before
analysis. Do not add an unvalidated side-channel file or silently change the
single-line v1/v2 framing. Output includes separately typed summary records and
counts under the same verified completed stream as graph operations. Separate
metadata counters from graph fact counters; metadata is not a Canonical fact.

Keep the existing hard caps as the initial ceiling: aggregate stdin 1,000,000
bytes, individual lines 1,000,000 bytes, stdout 10,000,000 bytes, output events
10,000, stderr 1,000,000 bytes. Stream/chunk within them with backpressure;
records still count against the relevant aggregate cap. This is not a new
performance threshold or evidence that large repositories fit. Oversized state
fails explicitly with the old graph intact; increasing a cap requires measured
evidence and review, not an automatic full reparse.

Extend the existing TypeScript full/patch staging and one Store transaction so
graph/support/Evidence/coverage, derived summary activation and indexed
fingerprint commit together. A malformed, partial, stale or incompatible result
publishes none of these. Source reconciliation can already record a newer source
fingerprint; this must not overwrite the active analysis-state fingerprint.

### Incremental algorithm

1. Validate active graph and complete compatible baseline summaries against the
   requested base. Validate source delta against the complete target inventory.
2. Remove deleted summaries, parse added/modified eligible sources using existing
   verified source access and worker admission, and construct the target index
   from changed extraction plus retained declarations/imports/inheritance.
3. Determine affected relation sites from declaration/import/inheritance changes.
   Include unresolved/ambiguous sites and changed candidate sets, not just old
   resolved-edge reverse dependencies. Name additions can resolve an old unknown
   call; overload/deletion/import changes can invalidate an old resolution.
4. Re-resolve affected unchanged sites from compatible summaries when sufficient;
   any required source reparse must belong to an explicit resolver-dependent set
   bounded by request resources and verified against current bytes. Conservatively
   examining retained summaries is allowed; silently parsing all source is not.
   The first implementation may use a bounded deterministic summary scan rather
   than speculate about an optimized dependency index. Exceeding resources is a
   typed failure, not success with omitted dependents.
5. Compare old/new emitted Provider identities and digests, including shared
   synthetic ownership. Emit only justified removals/upserts. Do not remove a
   shared container while another file owns it. Unchanged sources are not added
   to `changes.modified` to make accounting pass; SOURCE_FILE keeps its exact
   add/modify contract. Dependency edge updates use retained source lookups.
6. Verify stream, stage and normalize through existing support-aware Apply.
   Keep unaffected support and history. Commit target summaries with the graph.

Missing/invalid/incompatible legacy summaries request an explicit full-analysis
bootstrap without altering the old graph. This exception is not routine refresh
behavior. Different revision IDs and immutable targets keep the accepted
`FULL_ANALYSIS_REQUIRED` boundary. Empty-delta replay must distinguish a matching
active baseline from a previously failed apply with already-reconciled sources;
derive changes from baseline summaries versus target inventory, or fail closed,
never mark an old graph current merely from an empty latest source delta.

## Task decomposition and traceability draft

These are proposed subdivisions of P05-W3-020, not new completed roadmap tasks
or an approved implementation plan. Exact TS/Rust schemas, migration/index/size
accounting, affected-site rules and reviewed Fixture goldens must be specified
after the architecture decision, before coding.

| Sequence | Subdivision / authority | Fixture and validation obligation |
|---|---|---|
| 1 | v3/state contract; ADR-010/014/015, Native IPC, Provider SPI, Security | Strict v1/v2 regression; negotiated v3 request/result and bad context/version/sequence/digest/limits; cancellation and slow consumers |
| 2 | Additive derived storage and full-analysis bootstrap; SQLite Schema, existing full Apply | Upgrade R009 without invented summaries; real full ANALYZE persists valid state; injected summary/pointer failures reopen with exact old graph/state |
| 3 | REFRESH extraction/index/resolution; WORK_BREAKDOWN, language adapter, scalability | Modify-call-target, add/delete class/method, change-import; restart, overload, ambiguous/unresolved target becoming resolved, inheritance and shared-container ownership |
| 4 | Runtime/Provider/Store composition; accepted P05-W1-011 boundaries | Real Rust stream into migrated SQLite; stale base, empty-delta retry after failed Apply, changed revision, immutable target, drift, malformed/partial stream, full rollback and second-Provider preservation |
| 5 | Task Evaluation; Evaluation and PHASE_ACCEPTANCE | Full-rebuild differential Canonical graph/coverage/support comparison; 100% declared incremental correctness, zero stale bindings; parse counts and Worker Consistency; pinned stage timing/memory |

Contract reviews and hand-derived Fixture expectations can be prepared
independently once the design is accepted. Implementation order is contract →
state/full bootstrap → refresh producer → composition → differential evaluation.
Do not parallelize schema producer/consumer work against an unapproved contract.
Graph-query design can be considered separately; it is not a way to declare
REFRESH complete or bypass the remaining Phase 0.5 gates.

Missing trace links today: no registered real-Native REFRESH Fixture, no v3
protocol byte corpus or descriptor golden, no analysis-state migration Fixture,
no restart/dependent/shared-container correctness runner, and no REFRESH parse
count/performance baseline. Existing synthetic patch evidence proves the
consumer path only. Proposed Fixture names are not registered capability claims.

## Acceptance, security, rollback and next decision

Retain Critical Symbol Recall ≥95%, Critical Direct Call Precision ≥95% and
Recall ≥90%, 100% declared incremental correctness, zero stale bindings, honest
coverage/outcomes, failure retention and all original architecture checks.
Record cold/1-/5-/50-file and worker-consistency evidence with scan/parse/resolve/
IPC/normalize/DB apply/total/peak-memory metrics; no new latency, memory or
dependency-count target is invented. P05-W9-001 still owns phase-wide evaluation.

Metadata is untrusted source-derived data. Apply existing include/exclude/secret
policy, bounded strings/counts/bytes and path checks; persist no raw source,
AST, unrestricted environment, prompt or secret payload. Transport is local,
shell-free and protocol-only stdout. Compatibility digests are integrity/context
checks, not a replacement for policy and schema validation.

Rollback disables v3 availability and leaves old v1/v2 full analysis and the
last valid graph usable. Additive derived tables can remain ignored; no history
or released migration is removed. A graph written without valid summaries needs
an explicit bootstrap before future refresh. Do not auto-publish degraded state.

On acceptance, add an ADR (next unused number), synchronize Architecture/Design
Authority, Native IPC, Provider SPI, SQLite Schema, Runtime Configuration,
Evaluation, scalability specification, Roadmap, Acceptance, Traceability and
Current Status; then review exact contracts, Fixtures and the implementation
plan. Existing original task milestones and Exit Criteria stay unchanged; this
adds necessary design/implementation effort inside P05-W3-020, not a Phase 0
reopen or Phase 1 dependency. No duration estimate is supported yet.

User decision requested: approve the v3 + TypeScript-owned derived summaries
approach (including additive R010 and unchanged initial hard limits), or choose
another approach. The first subsequent executable step is detailed contract and
Fixture design; product implementation waits for the governed design/plan review.
