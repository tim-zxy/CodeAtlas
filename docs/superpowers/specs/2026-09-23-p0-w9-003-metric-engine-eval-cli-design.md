# P0-W9-003 Metric Engine and Eval CLI Design

Date: 2026-09-23

Task: P0-W9-003

Status: written specification awaiting review

## Purpose and authority

Phase 0 needs reproducible precision and recall from the P0-W9-002 Canonical comparator, a way to evaluate declared critical facts and quality gates, and a machine-readable developer command. Success means an explicit Fixture directory produces a complete, auditable JSON report and reliable process status without running a Provider or publishing knowledge. The metric engine must not mistake a changed fact for a true positive or silently pass an undefined metric.

This design follows the [work breakdown](../../handoff/WORK_BREAKDOWN.md), [Phase 0 acceptance](../../handoff/PHASE_ACCEPTANCE.md), [Evaluation specification](../../handoff/specs/EVALUATION.md), [traceability matrix](../../handoff/DESIGN_TRACEABILITY.md), ADR-002, and ADR-012. The work-breakdown summary explicitly mentions critical-fact recall; the higher-priority Phase 0 acceptance also requires critical-fact precision, so this task calculates both. No frozen Canonical IR schema, approved baseline, or quality threshold changes here.

## Boundary and data flow

The pure metric and quality-gate routines belong in `@codeatlas/evaluation`, consuming the existing deterministic `CanonicalComparison` and a validated Fixture manifest. They do not read files, run providers, change comparator matching, or update baselines. The developer-facing `ekp-dev eval <fixture>` command lives at the repository root, separate from the production `apps/cli` dependency boundary. In this repository it is invoked as `pnpm ekp-dev eval fixtures/evaluation/<name>`; it is not a globally installed executable.

`<fixture>` is an explicit filesystem directory, not a registry ID. The command uses the existing registry to validate that directory's `fixture.json` and artifacts. It requires exactly one discovered Fixture; zero or multiple manifests are input errors, not implicit selection. For this Phase 0 command, `inputs.actual` and `expected.canonical` must each refer to a JSON file containing an object with `nodes` and `edges` arrays. The registry's more general artifact maps remain unchanged. The command parses both files, passes their contents to `compareCanonicalFacts` for strict IR validation and comparison, calculates metrics and gates, and serializes one report. It does not invoke a Provider, runtime, database, or production CLI and adds no third-party dependency.

## Scoring contract

For each `NODE` or `EDGE` comparison entry, an unchanged pair (`classification: null`, empty `differences`) contributes one TP. A paired entry with one or more differences contributes exactly one FP and one FN, even when semantic and resolution differences coexist. `MISSING` contributes one FN; `EXTRA` contributes one FP. Node and edge counts are independent. For each category, precision is `TP / (TP + FP)` and recall is `TP / (TP + FN)`. Ratios are calculated from integer counts without rounding before gate evaluation.

`criticalFacts[].id` denotes an expected fact's stable `factKey`; `type` disambiguates `NODE` from `EDGE`. Before scoring, every declaration must have a recognized type and identify an expected fact of that type. Invalid or ambiguous declarations fail as Fixture errors with a manifest field path. Only declarations with `importance: "CRITICAL"` enter critical scoring; other importance values remain permitted by the v1 registry but are listed as coverage exclusions. For a declared critical expected fact, an unchanged pair contributes one critical TP, a changed pair one critical FP and FN, and a missing fact one critical FN. An undeclared extra fact contributes to node/edge FP but not critical FP: critical precision measures predictions occupying declared critical slots, not all predictions. The report states this scope and lists critical failures by declared type and FactKey. The critical counts yield critical-fact precision and recall by the same formulas.

When a metric denominator is zero, its value is JSON `null` with an explicit reason (`NO_PREDICTIONS` for precision, `NO_EXPECTED_FACTS` for recall). A quality gate on that metric is `NOT_EVALUABLE` and cannot pass automatically. In particular, an all-empty graph does not report perfect precision or recall. The six metric names are `nodePrecision`, `nodeRecall`, `edgePrecision`, `edgeRecall`, `criticalFactPrecision`, and `criticalFactRecall`.

## Gates, report, and process behavior

The Phase 0 runner accepts quality gates only for those six names, using the existing manifest operators `>=`, `>`, `<=`, `<`, and `==`; thresholds must be finite ratios in `[0, 1]`. An unknown name or out-of-range threshold is a Fixture error. The registry may remain generic for future phases, but this runner must never silently ignore a gate. Each declared gate records its metric value, operator, threshold, and `PASS`, `FAIL`, or `NOT_EVALUABLE` result. No gate means no gate result; absence is not an implicit quality promise.

One JSON v1 report on stdout contains report version; Fixture ID and schema version; tool version; `providerVersion` and `runtimeVersion` as `null` because neither is run; per-group TP/FP/FN counts; all six metric values and null reasons; critical-fact failures; coverage exclusions (including non-CRITICAL declarations and the critical-precision scope); every gate result; overall result; wall-clock duration; and available process resource-use data. Unavailable resource measurements are `null` with a reason, not invented values. Count, metric, failure, exclusion, and gate ordering is deterministic; duration and resource measurements are observational and are not golden-compared byte-for-byte.

Valid input always yields the complete JSON report and no human prose on stdout. Passed declared gates produce exit code 0. A failed or not-evaluable declared gate still yields the complete report and exit code 1. Input, manifest, artifact, JSON, or comparator-validation errors produce no partial report, a controlled diagnostic on stderr with actionable Fixture/artifact path, and exit code 2. Diagnostics do not echo arbitrary source payloads. If there are no declared gates, the report says so and exit code 0 denotes successful evaluation only, not satisfaction of undeclared thresholds. The command never rewrites expected artifacts or baseline files.

## Verification and scope

Add a metric golden Fixture and focused tests for node, edge, and critical TP/FP/FN; unchanged pairs with different opaque IDs; missing and extra facts; semantic and resolution changes on one pair counting once; critical exclusions; and empty denominators. Verify unknown type, nonexistent `(type, factKey)`, invalid gate names or thresholds, malformed/missing artifacts, and zero or multiple discovered Fixtures as controlled errors. Process-level CLI tests cover exit 0, 1, and 2 and assert that valid runs have a single parseable JSON document while invalid runs have no JSON report. Golden tests compare deterministic report fields and separately assert the shape of observational measurements.

The implementation plan will wire these tests into the root test command, run package/Fixture checks and `pnpm verify` including architecture guards, and update `DESIGN_TRACEABILITY.md` and `CURRENT_STATUS.md` with fresh reproducible evidence. It will not declare Phase 0 complete merely because P0-W9-003 passes: all applicable Phase 0 acceptance checks still govern that decision. Provider execution, general-purpose metric plugins, runtime/knowledge/agent-utility metrics, semantic judging, and baseline regeneration are outside this task.
