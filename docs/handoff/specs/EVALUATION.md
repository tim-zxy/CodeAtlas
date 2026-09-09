# Evaluation Specification

## Principle

Use deterministic checks whenever possible, structured comparison when facts have schemas, and semantic judging only for qualities that cannot be mechanically verified. Evaluation is part of every implementation phase.

## Layers

- L1 Code Intelligence: symbol/reference/call/entry-point precision and recall, critical fact recall, resolution distribution, coverage.
- L2 Runtime and Graph: critical node/transition/path recall, contract extraction/match precision and recall, boundary correctness.
- L3 Knowledge: freshness, grounding, state-aware consistency, coverage, usefulness, identity preservation, false-new/merge/split rates.
- L4 Agent Utility: context hit rate, knowledge reuse, raw-code fallback, correction rate, impact acceptance, latency and budget.

## Fixture manifest

```yaml
schemaVersion: 1
id: java-call-basic
category: code-intelligence
phase: "0.5"
languages: [java]
capabilities: [SYMBOL, CALL]
inputs: { source: source/ }
expected: { nodes: expected/nodes.json, edges: expected/edges.json }
criticalFacts:
  - { id: call-order-to-payment, type: EDGE, importance: CRITICAL }
qualityGates:
  callPrecision: { operator: ">=", threshold: 0.95 }
  callRecall: { operator: ">=", threshold: 0.90 }
```

Incremental fixtures contain baseline, modified, declared changes, and expected added/removed facts with zero stale state.

## Comparator and reports

Canonical comparison classifies missing, extra, semantic difference, and resolution difference. Reports include fixture/schema versions, provider/runtime versions, raw counts, metrics, critical failures, coverage exclusions, duration, and resource use. Baseline changes are reviewed artifacts, never silently regenerated.

## Reference strategy

Native analysis is evaluated with ground-truth fixtures, differential comparison against reference providers such as CodeGraph/SCIP when available, manual spot checks, and downstream utility. Agreement with one provider is evidence, not truth.

Prompt changes run knowledge fixtures for grounding, probes, identity preservation, state consistency, token use, and false structural changes. Deterministic CI, reference-model prompt CI, and optional compatibility benchmarks are separate.

