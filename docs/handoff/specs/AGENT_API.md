## Owned read lifecycle integration - 2026-11-09

The additive [managed host](../../superpowers/specs/2026-11-09-owned-read-lifecycle.md)
implements existing P1-18 coordination for the already-approved nine leaves/five
read names, without new wire schemas. It starts after initial callback reconciliation
and requires READY plus an unchanged event generation before dispatch/async delivery;
uncertainty/change refuses with the existing version-correct CONTEXT_UNAVAILABLE.
Per-tool permission/basis/counter checks remain mandatory. A readonly abort signal
propagates lifecycle shutdown/failure immediately to leaf contexts; late ownership and
pending work settle before completion, with UNKNOWN retained. Old factories are
unchanged. Observer doubles/owned metadata do not prove live Source freshness or
production readiness; ordinary production CLI, update and data access stay closed.


## Approved stored EXECUTION/RUNTIME v3 + explicit L2 - 2026-11-09

[Exact approved refinement](../../superpowers/specs/2026-11-09-stored-structure-l2.md)
adds trace_flow v3 kinds EXECUTION/RUNTIME and get_project_context v3 depth L2.
Host fixes workspace/repository and readonly Runtime format1/2 opener. Every request
pins expectedActivationId and expectedRevisionId; EXECUTION starts at an exact
ExecutionNode, RUNTIME at an exact RuntimeFlow/stepKey, FORWARD only. No name,
position, historical/latest-version or exception-driven schema fallback.

Strict complete Runtime IR, identity, candidate and activation digests are validated
before traversal. The actual existing Store readonly snapshot preserves CURRENT/
AFFECTED and LOCAL_DECLARED_RUNTIME. BFS retains original members/support/confidence,
non-resolved targets, selected branches and original outgoing references. Explicit
depth/node/edge limits return actual frontier; full metadata/control/byte/token
exhaustion refuses. Original outgoing references outside the selected subset are
not materialized graph nodes, nor a completeness claim.

Result explicitly states STORED_DERIVED_NOT_OBSERVED_EXECUTION. Code basis, exact
activation/revision, stored coverage and source evidence remain in engineeringResult;
knowledge-only wrapper meta is null/not applicable. L2 requires explicit selection,
EXPLICIT_STORED_STRUCTURE and projectCompleteness NOT_ASSESSED; it uses the same
actual query and meters its whole chosen response once. No Source body/model/update.

The additive structure-read SDK host constructs nine genuine leaves under one
captured scope with the same five names; it composes exact v1/v2/v3 routes and
matching failure formats. Per-operation permissions/ceilings and immediate abort/
joined close preserve UNKNOWN. Existing factories remain; normal production CLI,
query/publication, user DB, R9 and all original acceptance gates stay closed/open
as before. [Reproducible evidence](../../superpowers/plans/2026-11-09-stored-structure-l2.md).


## Approved bounded CODE v2 and explicit-query L1 v2 - 2026-11-09

The [approved exact refinement](../../superpowers/specs/2026-11-09-code-trace-l1.md)
adds two self-owned read variants. trace_flow version2/kind CODE requires exact
Canonical symbol and active expected revision, OUTGOING_CALLS only, bounded existing
CODE_TRACE; relationshipSemantics STATIC_CALLS_NOT_RUNTIME explicitly distinguishes
static calls from runtime execution. Original strict engineering envelope preserves
code freshness/coverage/evidence and truncation; knowledge-only meta is null/not
applicable, no fabricated CodeBasis or continuation. Missing/revision mismatch refuses.

get_project_context version2/depth L1 requires an explicit lexical phrase and type
filter, fixed workspace, first-page maxItems and maxDepth0. It reuses published FTS
retrieval with purpose get_project_context/L1; response retains search hits/metadata
plus contextVersion2, EXPLICIT_LEXICAL_QUERY and projectCompleteness NOT_ASSESSED.
No inferred task, Source body, automatic L2 or model call. Full new envelopes are
measured once by each genuine server counter before delivery; no internal fake meter.

The additive extended host constructs seven genuine leaf sessions under one captured
scope and exposes the same five tool names. Strict unions route only exact v2
discriminators, including matching host-level failure formatters. All leaves are
invalidated immediately and async cleanup is joined; UNKNOWN remains UNKNOWN.
Old individual/three/five hosts and v1 BUSINESS/L0/search/status/symbol stay compatible;
bare v1 CODE remains FEATURE_UNAVAILABLE. No production access or update tool.


# Agent API Specification

## Request and response contract

All operations receive a request context containing workspace, optional repository/revision set, scope, token/result budget, caller capabilities, permission context, and cancellation/deadline. Every response includes source freshness, compilation currency where relevant, coverage, warnings, and references.

Core Phase 1 tools:

1. `get_project_context`: bounded system/repository overview and important knowledge.
2. `search_knowledge`: lexical search plus graph expansion; semantic ranking only when enabled.
3. `understand_symbol`: symbol definition, relations, entry/runtime relevance, confidence, coverage.
4. `trace_flow`: code, execution, runtime, or business trace with explicit trace kind.
5. `get_knowledge_status`: graph state, affected knowledge, compilation currency, provider health.
6. `update_knowledge`: permissioned command with scope and update mode.

Phase 2 adds `analyze_impact`, `prepare_change_context`, `explore_relations`, and `get_architecture_context`.

## Scope and update modes

Knowledge scope is `AUTO | REPOSITORY | WORKSPACE | CROSS_REPO | ALL`. Update mode is `AFFECTED_ONLY | FULL`, defaulting to `AUTO` and `AFFECTED_ONLY`. One MCP stdio process binds to one discovered workspace.

## Context item

```ts
interface ContextItem {
  ref: EntityRef;
  kind: string;
  title: string;
  summary?: string;
  properties: Record<string, unknown>;
  supportRefs: EntityRef[];
  confidence?: Confidence;
  sourceFreshness: string;
  compilationCurrency?: string;
}
```

## Behavioral rules

- Return last published knowledge with `AFFECTED` warnings rather than hiding it.
- Identify code trace, `ExecutionGraph` trace, `RuntimeFlow`, and `BusinessFlow` distinctly.
- Enforce result/token/depth budgets and report truncation.
- Never return raw secret source merely because a derived fact is accessible.
- Query tools are read-only. `update_knowledge` requires explicit write permission and cannot edit source code.
- Errors are typed, actionable, and never encoded as successful empty results.

## Progressive knowledge consumption (Phase 1 design)

Agent context has L0 bounded project summary, L1 task-relevant published knowledge, and L2 deeper engineering facts/evidence on demand. These are response-depth levels, not new truth stores or a requirement to preload the entire Wiki at agent startup. The existing request budget and permissions constrain each level; escalation to L2 is explicit or query-driven and returns bounded references and truncation information.

When published knowledge is affected or stale, return its `SourceFreshness`, `CompilationCurrency`, coverage, and evidence limitations, then use an authorized read-only query of current engineering facts where needed. Never present older knowledge as fresh or infer missing cross-repository relationships. Ordinary `get_project_context`, `search_knowledge`, `understand_symbol`, and `trace_flow` calls remain read-only and must not implicitly enqueue or invoke `update_knowledge`. This refines future Phase 1 behavior without changing the current Phase 0 API shell or rewriting the six named tools.


## Versioned BUSINESS public contract, owned-data implementation - 2026-11-09

The user-approved [v1 contract](../../superpowers/specs/2026-11-09-business-trace-public-contract.md)
fixes strict arguments and complete data/meta/failure envelopes. BUSINESS selects an
exact published Knowledge item/revision and local starting step; forward/backward
declared-step traversal preserves source, current-head/history and explicit frontier.
Other known trace kinds return FEATURE_UNAVAILABLE without a query.

The owned Agent API session captures server workspace/repositories, maximum limits,
authorization/query/counter ports and an opaque process-local context. It checks the
entire read manifest before query and delivery. The complete canonical success JSON,
including all metadata, is byte-bounded and measured by a matching fixed exact local
counter policy and SHA256. Missing/estimated counts refuse before read; malformed or
mismatched measurements refuse delivery. Fixture counters prove enforcement only;
no real tokenizer, production principal or public MCP transport is installed.

This additive contract does not make the six-tool service complete. Existing private
trace/Wiki and production admission remain separate; P1-17/18 and original quality
gates stay open. [Implementation/evidence](../../superpowers/plans/2026-11-09-business-trace-public-contract.md).

## Approved SDK-backed owned stdio component - 2026-11-09

SDK1.32.2/fast-uri3.1.9 is conditionally adopted after the independent92-package
[artifact audit](../../superpowers/reviews/2026-11-09-sdk1322-audit.json). Official
low-level Server handlers/stdio input parser/serializer retain the existing strict
BUSINESS union and six-field ResultMeta. Agent API exports fresh wire schemas
using its own Zod instance; no cross-version class casts or public field changes.

The [host-supplied owned service](../../superpowers/specs/2026-11-09-owned-mcp-stdio.md)
fixes its existing session/context and explicit limits. It never reads caller
permissions/workspace paths into authority, and only advertises trace_flow.
Other selectors/tools refuse; normal CLI still requires a real approved Runtime
binding. Shutdown invalidates and aborts, closes protocol and joins pending reads
and writes; failed output reports UNKNOWN. Ignoring external providers can keep
completion pending. No hard OS sandbox, remote/model/tokenizer access, production
service or P1-18 acceptance is inferred from this component.

## Approved owned search_knowledge first-page v1 - 2026-11-09

[Exact approved slice](../../superpowers/specs/2026-11-09-owned-knowledge-search.md):
LEXICAL_PHRASE/WORKSPACE only, strict five-type filter, first-page positive limit and
null cursor, zero graph depth. Phrase/title-summary-goal search uses existing
unicode61 FTS, BM25 then IDs; no semantic search or Chinese quality guarantee.
Owned session fixes workspace/allowed repositories, pre-read/pre-delivery field
permission and exact byte/token ceilings. Public hits retain exact published refs,
scoped support/provenance/coverage and original freshness/currency. Empty or mixed
aggregate metadata stays null; MAX_RESULTS explicitly marks the page bound.

Missing/changed index, denial, malformed evidence/control or absent token policy
refuse with static typed errors; counts/rank/raw source are not public. Full
projected records are rechecked after MATCH/rebuild. A separate host-supplied
search-only stdio factory shares the existing SDK lifecycle; BUSINESS-only factory
and normal CLI behavior remain compatible. No user data/production authority is
enabled, no complete P1-17/18 closure. [Evidence](../../superpowers/plans/2026-11-09-owned-knowledge-search.md).

## Approved selected L0 get_project_context v1 - 2026-11-09

[Exact owned slice](../../superpowers/specs/2026-11-09-owned-l0-context.md) fixes
explicit server-selected current published refs and stable ID order. Request only
selects L0 and bounded item/byte/token controls; no task/query, auto retrieval or
arbitrary scope/path. Read exact metadata before/after using existing restricted
Store projection; never replace missing/historical refs with current versions.
Return literal title/summary/source, labelled stored-goal fallback, support/coverage/
freshness/currency/provenance, disjoint missing/omitted refs and safe typed failures.

EXPLICIT_SELECTION_ONLY and projectCompleteness NOT_ASSESSED are mandatory.
AVAILABLE describes only the selected finite set; empty is MISSING_DATA, and
missing/truncated subsets remain explicit. Full metadata is byte/token-bounded;
no production tokenizer/permission, whole overview, L1/L2 or production query is
implied. Separate one-session SDK factory preserves existing two factory contracts
and normal CLI closure. [100-test evidence](../../superpowers/plans/2026-11-09-owned-l0-context.md).

## Existing-contract three-tool owned stdio host - 2026-11-09

The additive [host composition](../../superpowers/specs/2026-11-09-owned-read-toolset.md)
constructs the three already-approved sessions from one captured workspace/repository
scope. It rejects per-tool scope fields and does not trust returned descriptors
as authority. A descriptor-only snapshot precedes host callback binding; independent
copies prevent construction-time caller mutation from changing later sessions.
No startup domain-port reads, model or updates; only trace_flow(BUSINESS),
search_knowledge(first page) and get_project_context(selected L0) advertise.
Every exact wire schema, context, authorization and local ceiling is preserved;
global call/write bounds and joined shutdown span all three. Existing single-tool
factories remain compatible. Normal CLI/production, watcher/reconciliation and the
remaining three tools are not enabled. [41-test evidence](../../superpowers/plans/2026-11-09-owned-read-toolset.md).

## Approved status and stored-symbol v1, owned data - 2026-11-09

[Strict contracts](../../superpowers/specs/2026-11-09-status-symbol.md) add
get_knowledge_status(SELECTED_PUBLISHED) and understand_symbol(STORED_CODE) with
fixed host scope, complete canonical byte/token limits and pre-read/pre-delivery
authorization. Status omits display/body SQL expressions and exposes only selected
metadata, partitioned missing/omitted refs/counts, NOT_ASSESSED whole-project state
and NOT_OBSERVED/UNAVAILABLE provider/run fields. Symbol pins exact Canonical ID
and active revision, uses actual existing code query and preserves original code
freshness/coverage/refs; knowledge meta null means NOT_APPLICABLE, runtime relevance
is NOT_EVALUATED, not a guessed relation. Source body/production remain closed.

An additive five-read SDK factory reuses captured common scope and global limits;
old single/three factories remain compatible, update is absent. Symbol close
invalidates and aborts immediately, joins registered source work, preserves UNKNOWN
on cleanup failure and forbids reopening. SDK observes and joins each async
invalidation once; UNKNOWN is never reported SETTLED. No wire cleanup fields were
added, nor a real tokenizer/production authority. [148 + affected38 overlapping evidence](../../superpowers/plans/2026-11-09-status-symbol.md).
