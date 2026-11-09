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
