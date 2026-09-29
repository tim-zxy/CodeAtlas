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

The registry validates schema version `1`, unique manifest IDs, the four layer categories, phases `"0"`, `"0.5"`, `"1"`, `"2"`, and `"3"`, nonempty exact strings, unique list values and critical-fact `(type, id)` pairs, and finite thresholds with operators `>=`, `>`, `<=`, `<`, or `==`. The same `id` may name a NODE and an EDGE, but duplicate declarations of the same type and ID fail. `inputs` and `expected` are nonempty named maps of existing file or directory paths relative to the manifest directory. Absolute, drive/UNC, traversal, backslash, and symlink-escape paths fail with the manifest and field path. Discovery is deterministic and fails atomically on any invalid manifest. The registry does not compare facts or calculate the gates; those belong to P0-W9-002 and P0-W9-003.

Incremental fixtures contain baseline, modified, declared changes, and expected added/removed facts with zero stale state.

## Comparator and reports

P0-W9-002 provides a pure, in-memory comparison of expected and actual Canonical Code IR node/edge arrays. Both sides are validated with the strict IR schemas; duplicate Canonical IDs, per-type FactKeys, or sparse array slots fail atomically with an input field path. Same-type facts pair by FactKey first, then by unique Canonical ID among the remainder. No similarity matching occurs. Unpaired expected facts are `MISSING`; unpaired actual facts are `EXTRA`. For a paired fact, changed non-target canonical payload fields are `SEMANTIC_DIFFERENCE`, while an edge target's state, resolution, resolved reference, hint, or ordered candidates produce `RESOLUTION_DIFFERENCE`. Both classes may occur on one pair. A different opaque ID on a FactKey match is not itself a difference; edge references to paired nodes compare through the established mapping even when literal IDs coincide, and literal equality applies only when neither reference names a paired node. The comparator does not resolve an unresolved target. The result includes unchanged pairs, changed pairs with field paths, and unmatched facts in deterministic order, allowing P0-W9-003 to count each pair once. The declared `p0-canonical-comparator-v1` Fixture at `fixtures/evaluation/comparator-v1/fixture.json` exercises all four classes.

P0-W9-003 calculates node, edge, and critical-fact precision/recall from the comparator's entries. An unchanged pair is one TP; a changed pair is one FP and one FN regardless of its number of field differences; `MISSING` is one FN; `EXTRA` is one FP. Precision is `TP / (TP + FP)` and recall is `TP / (TP + FN)`, without rounding for gate comparisons. A zero denominator yields JSON `null` with `NO_PREDICTIONS` or `NO_EXPECTED_FACTS`, not a perfect score.

For this Phase 0 evaluator, `criticalFacts[].id` is an expected FactKey and `type` is `NODE` or `EDGE`. Every declaration must resolve to a fact of its declared type in the expected graph, including non-CRITICAL declarations. Only `importance: "CRITICAL"` contributes to critical TP/FP/FN; other declarations are coverage exclusions. A changed critical pair is one critical FP and FN, a missing one is FN, and an unchanged one is TP. Undeclared actual extras reduce ordinary node/edge precision but are excluded from critical precision, which is scoped to declared critical slots. Critical failures and exclusions appear in the report.

The repository-only `pnpm ekp-dev eval <fixture-directory>` discovers exactly one manifest under the explicitly supplied directory and reads JSON files at `inputs.actual` and `expected.canonical`. It runs no Provider, product Runtime, database, or production CLI. The six supported Phase 0 gate names are `nodePrecision`, `nodeRecall`, `edgePrecision`, `edgeRecall`, `criticalFactPrecision`, and `criticalFactRecall`. Thresholds are finite ratios in `[0, 1]`; unknown names fail as Fixture errors. A gate on a null metric is `NOT_EVALUABLE` and does not pass. The JSON v1 report includes Fixture/schema and tool versions, `null` Provider/Runtime versions, raw counts, metrics and null reasons, critical failures, coverage exclusions and critical-precision scope, each gate result, overall status, duration, and available process RSS. Exit 0 means evaluation succeeded with all declared gates passed (or none declared); exit 1 means at least one declared gate failed or was not evaluable, with a complete JSON report; exit 2 means invalid input and no JSON report. Expected baselines are never rewritten; any baseline change is a reviewed artifact.

## Reference strategy

Native analysis is evaluated with ground-truth fixtures, differential comparison against reference providers such as CodeGraph/SCIP when available, manual spot checks, and downstream utility. Agreement with one provider is evidence, not truth.

Prompt changes run knowledge fixtures for grounding, probes, identity preservation, state consistency, token use, and false structural changes. Deterministic CI, reference-model prompt CI, and optional compatibility benchmarks are separate.

## Additional path-specific evidence (future phases)

Phase 0.5 Native Analyzer evaluation adds a Worker Consistency case to the existing pinned cold/1-/5-/50-file suite. Compare normalized Canonical Graph semantics, coverage, and stale-fact state across distinct effective worker counts and completion orders, and report the scan/parse/resolve/IPC/normalize/DB-apply/total/peak-memory stages. Existing Phase 0.5 accuracy and incremental gates remain unchanged; performance thresholds require reviewed measured baselines.

P05-W3-003 registers exact Native IPC v2 coverage/outcome Fixtures and reports eligible/covered/unsupported/partial site counts and the `EXACT`/`HEURISTIC`/`AMBIGUOUS`/`UNRESOLVED`/`UNSUPPORTED` relation distribution per file/capability. Cross-language validation checks the site partition and resolution sum; Java goldens check source-grounded counts and distinguish valid zero-fact success, syntax partial, unsupported language/capability, parser exception, timeout, and resource failure. A v1 stream reports numerical statistics as unavailable, not zero. No new numerical Quality Gate or change to the existing Phase 0.5 accuracy thresholds follows from ADR-015.

P05-W4-001 registers `canonical-normalization` with one complete two-file
Provider input and exact ordered Canonical node/edge pairs, including duplicate
package support and unresolved/ambiguous targets. Key vectors and the three
unchanged Java relation source Fixtures exercise provider independence,
real-binary integration, and schema validity. The Canonical comparator checks
only unique-key subsets before FactMerger; duplicate-support pairs are compared
directly. This adds no numerical gate or new baseline for extraction accuracy.

P05-W4-002 registers `two-provider-same-call`. It independently normalizes
two transformed copies of the pinned completed Native stream, with distinct
Provider snapshots and reversed fact-event order for one observation;
checked-in current-view summaries and full-result SHA-256 digests pin the
two-, one-, and zero-support outputs. Focused tests also validate emitted
Canonical and Evidence/Binding IR, support-order independence, conservative
confidence, resolution selection, malformed input, and atomic dangling-reference
rejection. This does not replace later database-level stale-binding or
incremental Evaluation gates and adds no numerical threshold.

P05-W1-010 registers `p05-repository-activation-v1` and
`p05-full-analysis-apply-v1`. The repository migration, bounded provisional
stream, staged normalization/merger, and atomic Store tests cover legacy
unknown freshness, current/stale fingerprint checks, success with zero or
Java SYMBOL facts, same-WORKTREE replacement, and rollback after destructive
SQL steps. Runtime composition runs `java-basic-symbol` through the real
Native binary into a migrated temporary repository database and checks active
Canonical facts, Evidence, coverage, and freshness. `PARTIAL`, analyzer
failure, cancellation, and changed source do not activate a candidate.
The Cold Index case reports observed apply total and sampled Node RSS on its
pinned input; these do not include Native child RSS or separate internal
scan/parse/resolve/IPC/normalize/DB-apply timings. The broader stage-by-stage
performance and Worker Consistency baseline remains P05-W9-001, with no new
threshold inferred from this task's single-file observation.

Phase 1 Knowledge evaluation distinguishes parser-grounded and source-grounded-degraded candidate paths. Report grounding, unsupported/partial coverage, unverified relations, publication acceptance/rejection, and agent utility by generation method without inventing a new numerical pass threshold. Later Diagram projection evaluation checks source/version references, permission/freshness, graph grounding, type-specific completeness, and sequence-order evidence. An unsupported diagram is reported as such, not rendered as a complete graph.

