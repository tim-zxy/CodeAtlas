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

