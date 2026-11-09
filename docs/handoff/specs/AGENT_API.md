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
