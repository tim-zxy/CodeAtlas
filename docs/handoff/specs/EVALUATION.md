# Evaluation Specification

## Principle

Use deterministic checks whenever possible, structured comparison when facts have schemas, and semantic judging only for qualities that cannot be mechanically verified. Evaluation is part of every implementation phase.

## Layers

- L1 Code Intelligence: symbol/reference/call/entry-point precision and recall, critical fact recall, resolution distribution, coverage.
- L2 Runtime and Graph: critical node/transition/path recall, contract extraction/match precision and recall, boundary correctness.
- L3 Knowledge: freshness, grounding, state-aware consistency, coverage, usefulness, identity preservation, false-new/merge/split rates.
- L4 Agent Utility: context hit rate, knowledge reuse, raw-code fallback, correction rate, impact acceptance, latency and budget.

## Fixture manifest

The evaluation registry recursively discovers files named `fixture.json` under an explicitly supplied root. Version 1 is strict JSON; all fields below are required, even when an array or quality-gate map is empty. Existing task-specific `cases.json` indexes are separate and are not discovered as evaluation manifests.

```json
{
  "schemaVersion": 1,
  "id": "java-call-basic",
  "category": "code-intelligence",
  "phase": "0.5",
  "languages": ["java"],
  "frameworks": [],
  "capabilities": ["SYMBOL", "CALL"],
  "inputs": { "source": "source/" },
  "expected": { "nodes": "expected/nodes.json", "edges": "expected/edges.json" },
  "criticalFacts": [{ "id": "call-order-to-payment", "type": "EDGE", "importance": "CRITICAL" }],
  "qualityGates": {
    "callPrecision": { "operator": ">=", "threshold": 0.95 },
    "callRecall": { "operator": ">=", "threshold": 0.9 }
  }
}
```

The registry validates schema version `1`, unique manifest IDs, the four layer categories, phases `"0"`, `"0.5"`, `"1"`, `"2"`, and `"3"`, nonempty exact strings, unique list values and critical-fact IDs, and finite thresholds with operators `>=`, `>`, `<=`, `<`, or `==`. `inputs` and `expected` are nonempty named maps of existing file or directory paths relative to the manifest directory. Absolute, drive/UNC, traversal, backslash, and symlink-escape paths fail with the manifest and field path. Discovery is deterministic and fails atomically on any invalid manifest. The registry does not compare facts or calculate the gates; those belong to P0-W9-002 and P0-W9-003.

Incremental fixtures contain baseline, modified, declared changes, and expected added/removed facts with zero stale state.

## Comparator and reports

P0-W9-002 provides a pure, in-memory comparison of expected and actual Canonical Code IR node/edge arrays. Both sides are validated with the strict IR schemas; duplicate Canonical IDs or per-type FactKeys fail atomically with an input field path. Same-type facts pair by FactKey first, then by unique Canonical ID among the remainder. No similarity matching occurs. Unpaired expected facts are `MISSING`; unpaired actual facts are `EXTRA`. For a paired fact, changed non-target canonical payload fields are `SEMANTIC_DIFFERENCE`, while an edge target's state, resolution, resolved reference, hint, or ordered candidates produce `RESOLUTION_DIFFERENCE`. Both classes may occur on one pair. A different opaque ID on a FactKey match is not itself a difference; edge references are compared through the established node pairs without resolving an unresolved target. The result includes unchanged pairs, changed pairs with field paths, and unmatched facts in deterministic order, allowing P0-W9-003 to count each pair once. The declared `p0-canonical-comparator-v1` Fixture at `fixtures/evaluation/comparator-v1/fixture.json` exercises all four classes.

P0-W9-003 owns precision/recall, critical-fact recall, quality-gate evaluation, the eval CLI, and machine-readable reports. Those reports include fixture/schema versions, provider/runtime versions, raw counts, metrics, critical failures, coverage exclusions, duration, and resource use. Baseline changes are reviewed artifacts, never silently regenerated.

## Reference strategy

Native analysis is evaluated with ground-truth fixtures, differential comparison against reference providers such as CodeGraph/SCIP when available, manual spot checks, and downstream utility. Agreement with one provider is evidence, not truth.

Prompt changes run knowledge fixtures for grounding, probes, identity preservation, state consistency, token use, and false structural changes. Deterministic CI, reference-model prompt CI, and optional compatibility benchmarks are separate.

