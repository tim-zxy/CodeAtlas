# P0-W9-001 Fixture Registry Design

Date: 2026-09-23
Task: P0-W9-001
Status: conversational design approved; written specification awaiting review

## Purpose and success criteria

Phase 0 needs one deterministic way to discover evaluation Fixtures and reject invalid declarations before comparison or metric calculation begins. A caller supplies a `fixtures/` root and receives validated, consistently ordered manifest descriptors, or actionable validation errors naming the manifest and field. Valid and invalid Fixture tests, the root test suite, and the architecture guardrail must pass when implementation is complete.

This design implements the P0-W9-001 row in the [work breakdown](../../handoff/WORK_BREAKDOWN.md), [phase acceptance](../../handoff/PHASE_ACCEPTANCE.md), and [traceability matrix](../../handoff/DESIGN_TRACEABILITY.md), under [Evaluation](../../handoff/specs/EVALUATION.md) and ADR-012. It does not alter a frozen architecture decision.

## Placement and compatibility

`@codeatlas/evaluation` owns the registry's manifest schema, discovery, and validation. The public API accepts an explicit filesystem root rather than assuming the process working directory. It returns typed metadata and paths to declared artifacts; it does not load expected facts or execute evaluation. This keeps evaluation below application and transport boundaries and requires no dependency on storage, providers, plugins, or native code.

The new registry recognizes only files named `fixture.json`, recursively under the supplied root. Existing `cases.json` files remain task-specific test indexes and are neither migrated nor interpreted as evaluation manifests. The Evaluation specification's YAML block describes field semantics; version 1 uses JSON on disk to match repository conventions. The implementation will update that specification with the normative filename and format so the example and executable contract stay aligned.

## Version 1 manifest

A manifest is a JSON object with no unknown top-level or nested fields. Required fields are:

- `schemaVersion`: integer `1`; other versions fail explicitly, without best-effort parsing.
- `id`: nonempty, stable, repository-wide unique Fixture identifier.
- `category`: one of `code-intelligence`, `runtime-graph`, `knowledge`, or `agent-utility`, corresponding to Evaluation layers L1–L4.
- `phase`: string `"0"`, `"0.5"`, `"1"`, `"2"`, or `"3"`.
- `languages`, `frameworks`, `capabilities`: arrays of nonempty, unique strings. Empty arrays are valid when that dimension does not apply; no language or framework implementation is implied by registration.
- `inputs` and `expected`: nonempty maps from nonempty artifact names to relative paths. A path may name an existing regular file or directory inside the manifest's Fixture directory; a trailing slash is permitted for a directory.
- `criticalFacts`: array of objects with nonempty `id`, `type`, and `importance` strings. IDs must be unique within the manifest. The registry validates declarations, not whether those facts are present or their type-specific semantics.
- `qualityGates`: map from nonempty metric names to objects with an `operator` from `>=`, `>`, `<=`, `<`, or `==`, and a finite numeric `threshold`. Metric names and threshold units are not interpreted until P0-W9-003.

Every required field must appear; `criticalFacts` and `qualityGates` may be empty. Version 1 does not infer defaults. An illustrative `fixture.json` is:

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
  "qualityGates": { "callPrecision": { "operator": ">=", "threshold": 0.95 } }
}
```

The example illustrates registration only; P0-W9-001 does not promise Java call analysis or precision calculation.

## Discovery, path safety, and failures

Discovery walks the supplied root recursively and processes matching filenames in stable, normalized relative-path order. An absent or unreadable root is an error. A root with no `fixture.json` files returns an empty registry; ordinary `cases.json` files do not make it invalid. A malformed manifest is never skipped: discovery fails rather than returning a partial registry. Duplicate IDs fail with both manifest paths.

Artifact paths use `/` separators and must be relative to the directory containing their `fixture.json`. Reject empty segments, `.` and `..`, absolute or drive/UNC paths, backslashes, and paths whose resolved target escapes through a symlink. Validate that each declared artifact exists and is a regular file or directory. Discovery must not follow directory symlinks outside the supplied root or loop through symlink cycles. These checks prevent path traversal without forbidding ordinary nested Fixture directories.

Errors include the root-relative manifest path where possible, a precise field path such as `expected.nodes`, and the reason. Parse and I/O errors name the offending path. Diagnostics do not dump artifact contents. Error ordering follows discovery order so CI output is reproducible.

## Verification and scope

Focused registry tests exercise recursive discovery, deterministic ordering, an empty root, and coexistence with existing `cases.json`. Valid manifests cover all metadata fields and both file and directory artifacts. Invalid cases cover unsupported version, malformed JSON, unknown/missing fields, duplicate IDs and list entries, illegal category/phase/operator/threshold, missing artifacts, traversal, absolute paths, and symlink escape. Tests assert the actionable manifest and field paths, not only that an exception occurred. Register the suite in root `pnpm test`; run `pnpm verify` and the architecture guardrail. Record fresh evidence and P0-W9-001 traceability in `CURRENT_STATUS.md` at implementation completion.

P0-W9-002 owns canonical fact comparison; P0-W9-003 owns metric calculation and the eval CLI. This registry does not compare actual versus expected facts, compute quality gates, regenerate baselines, publish canonical knowledge, or change the existing task-specific `cases.json` contracts.
