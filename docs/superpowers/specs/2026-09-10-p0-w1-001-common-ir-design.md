# P0-W1-001 Common IR Primitives Design

**Date:** 2026-09-10  
**Status:** Approved for implementation planning  
**Task:** P0-W1-001 Common IR primitives  
**Phase:** Phase 0

## Purpose

Define the smallest schema-first, provider-independent primitive contract shared by later Source IR, Code Fact IR, Evidence, storage, Provider SPI, and Native IPC work. This task establishes runtime validation, inferred TypeScript types, stable JSON behavior, version rejection, and deterministic fixtures. It does not implement any downstream entity model or persistence behavior.

## Governing authority

- `docs/handoff/adr/ADR-002-provider-independent-canonical-ir.md`
- `docs/handoff/adr/ADR-006-knowledge-layer-separation.md`
- `docs/handoff/adr/ADR-012-evaluation-phase-gate.md`
- `docs/handoff/specs/CANONICAL_IR.md`
- `docs/handoff/specs/MODULE_BOUNDARIES.md`
- `docs/handoff/WORK_BREAKDOWN.md`, task P0-W1-001
- `docs/handoff/PHASE_ACCEPTANCE.md`, Phase 0 Canonical schema gate
- `docs/handoff/DESIGN_TRACEABILITY.md`, P0-W1-001 row
+
The design preserves every frozen architecture invariant. It clarifies previously unspecified wire-level conventions but does not change Canonical IR ownership, identity semantics, persistence authority, update policy, or phase scope. No new ADR is required.

## Scope

### Included

- Zod runtime schemas and inferred TypeScript types for:
  - `EntityId`
  - `CanonicalId`
  - `EntityRef`
  - `SourceRange`
  - `Confidence`
  - `ResolutionLevel`
  - `SchemaEnvelope`
  - public UTC instant strings
  - SQLite-compatible epoch milliseconds as a conversion boundary
- exact schema-name and schema-version validation;
- typed validation, schema-mismatch, and unsupported-version errors;
- JSON-compatible parsing and serialization helpers where the contract requires behavior beyond direct Zod parsing;
- shared valid and invalid JSON fixtures;
- deterministic unit and fixture tests;
- root test-gate registration and controlling documentation updates.

### Excluded

- Repository, Revision, SourceFile, ProviderSnapshot, or RevisionSet;
- provider or canonical graph nodes and edges;
- Evidence, claims, candidates, or KnowledgeRevision;
- provider adapters, normalizers, FactMerger, or framework semantics;
- SQLite schemas, migrations, repositories, or direct database access;
- Native IPC envelopes or Rust consumers;
- Java parsing, source scanning, runtime graphs, knowledge workflows, LLMs, embeddings, watchers, daemons, or network behavior;
- automatic schema adaptation or a general schema registry.

These exclusions remain assigned to their declared later tasks and phases.

## Design principles

1. Zod schemas are the executable contract. Exported TypeScript types are inferred from those schemas rather than maintained separately.
2. JSON is the cross-process and cross-language representation. No class instance, `Date`, bigint, symbol, or provider-native value appears in serialized IR.
3. Validation is strict at public boundaries. Unknown object keys, enum members, schema names, and versions are not silently discarded or coerced.
4. Opaque identity strings remain opaque. Common IR does not infer meaning from UUID shape, prefixes, provider IDs, names, or source text.
5. `Confidence` and `ResolutionLevel` remain independent dimensions.
6. Parsing failures are deterministic and machine-classifiable while retaining field-path details.

## Package structure

The implementation remains entirely inside the dependency-bottom `@codeatlas/ir` package, except for shared fixtures, root test registration, and documentation.

```text
packages/ir/
  src/
    ids.ts
    references.ts
    confidence.ts
    time.ts
    errors.ts
    envelope.ts
    index.ts
  test/
    common-ir.test.mjs
fixtures/
  ir/
    common-v1/
      valid/
      invalid/
      cases.json
```

`@codeatlas/ir` may depend on Zod but must not depend on any other project package. The root architecture gate continues to prove this direction.

## Identity schemas

`EntityId` and `CanonicalId` use the same JSON representation: an opaque, non-empty string. The schema does not require a UUID, prefix, provider identifier, or generated-name convention. It does not trim or rewrite accepted identity values.
+
The inferred TypeScript types use distinct Zod brands. This prevents accidental compile-time interchange while preserving a language-neutral string wire format. Branding is not treated as a security boundary, and external values must still pass the corresponding runtime schema.

Whitespace-only values and values with leading or trailing whitespace are rejected. This prevents invisible identity aliases without introducing semantic normalization.

## Entity references

`EntityRef` is a strict object containing:

- `kind`: non-empty, trimmed string;
- `id`: validated `EntityId`;
- optional `revisionId`: validated `EntityId`.

This task intentionally leaves `kind` open rather than freezing future entity-kind enums. Later task-specific schemas may narrow it. No provider identifier is accepted as an alternative field.

## Source range convention

`SourceRange` is a strict object containing `sourceFileId`, `startLine`, `startColumn`, `endLine`, and `endColumn`.

Canonical coordinates are:

- zero-based;
- start-inclusive and end-exclusive;
- non-negative safe integers;
- columns measured as UTF-8 byte offsets within a line.

The end position must not precede the start position lexicographically by line then column. Empty ranges are valid. A multi-line end column refers to the ending line. These conventions align the native Tree-sitter boundary with Canonical IR and avoid Unicode ambiguity. Human-facing Agent API projections may later convert coordinates, but Canonical IR does not.

## Confidence and resolution

`ResolutionLevel` is the exact enum:

```text
EXACT | HEURISTIC | AMBIGUOUS | UNRESOLVED | UNSUPPORTED
```

`Confidence` is a strict object containing:

- `score`: finite number in the inclusive range `0..1`;
- `method`: non-empty, trimmed string naming the deterministic or declared method;
- `reasons`: an array of non-empty, trimmed strings.

Reasons may be empty when no additional explanation is available. Duplicates are not rewritten in this primitive layer. The schemas do not derive resolution from score or score from resolution.

## Time convention

Public Canonical IR timestamps use a normalized UTC ISO-8601 instant with millisecond precision:

```text
YYYY-MM-DDTHH:mm:ss.sssZ
```

Offsets other than `Z`, invalid calendar values, and non-canonical precision are rejected rather than normalized implicitly. A successful parse followed by serialization therefore preserves a single public representation.

SQLite boundaries use epoch milliseconds as finite safe integers. Explicit helpers convert between canonical UTC instants and epoch milliseconds and validate both directions. The primitive contract does not read or write SQLite.

## Schema envelopes and compatibility

The generic `SchemaEnvelope` shape is a strict object containing:

- `schema`: non-empty string;
- `version`: positive safe integer;
- `payload`: a JSON-compatible value validated by a caller-supplied payload schema.

Consumers construct a schema-specific envelope parser by declaring the exact supported schema name and version together with the payload schema. Parsing order is observable and deterministic:

1. validate the outer envelope shape;
2. compare the schema name;
3. compare the version;
4. validate the payload.

Schema-name mismatch and unsupported version are never converted into a generic payload error. This task supports exact version matching only. Explicit older-version adapters belong to the task that introduces a compatible older schema; no implicit downgrade, upgrade, or best-effort coercion is added now.

## Typed errors

Public parsing helpers throw errors with stable codes:

| Error | Code | Meaning |
|---|---|---|
| `IrValidationError` | `IR_VALIDATION_FAILED` | A primitive, envelope shape, or payload violates its schema. |
| `SchemaMismatchError` | `SCHEMA_MISMATCH` | The envelope schema name differs from the expected schema. |
| `UnsupportedSchemaVersionError` | `UNSUPPORTED_SCHEMA_VERSION` | The schema is recognized but its version is unsupported. |

Each error exposes structured context suitable for tests and later API mapping. Validation errors retain normalized field paths and messages without exposing raw secrets or arbitrary input payloads. Schema errors expose expected and actual identifiers or versions. Error messages are stable enough for operators, while tests assert codes and structured fields instead of entire prose strings.

Direct Zod schemas remain exported for composition and `safeParse`. Typed errors are produced by the task's explicit parsing helpers; the implementation does not globally replace Zod errors.

## JSON round-trip behavior

A value accepted from JSON bytes must:

1. parse as JSON;
2. pass the relevant Zod schema or envelope parser;
3. serialize through `JSON.stringify`;
4. parse and validate again;
5. remain deeply equal to the first validated value.

Round-trip stability applies to the validated JSON representation, not to TypeScript branding metadata, which does not exist at runtime.

## Fixture and test design

The canonical Fixture ID is `p0-common-ir-v1`. `cases.json` identifies every case, expected outcome, schema target, and expected typed error code/path where applicable. It is a task-local fixture index, not the Phase 0 fixture-registry manifest deferred to P0-W9-001.

Valid cases cover:

- each identity schema;
- entity references with and without `revisionId`;
- empty, single-line, and multi-line source ranges;
- all resolution levels;
- confidence boundary scores `0` and `1`;
- canonical UTC instant and epoch-millisecond conversion;
- a schema-specific envelope and JSON round-trip.

Invalid cases cover:

- empty, whitespace-only, and padded IDs;
- unknown keys on strict objects;
- negative, fractional, unsafe, and reversed coordinates;
- non-finite or out-of-range confidence;
- unknown resolution value;
- non-canonical or invalid timestamps;
- malformed envelope shape;
- wrong schema name;
- unsupported version;
- invalid payload.

Tests also include compile-time coverage through the normal strict TypeScript build and runtime assertions that parsed objects contain no silently stripped unknown fields.

## Acceptance and quality gates

P0-W1-001 is complete only when all of the following pass with fresh evidence:

- focused Common IR unit and fixture tests;
- all `p0-common-ir-v1` valid and invalid cases;
- exact schema-name/version rejection tests;
- JSON round-trip tests;
- `@codeatlas/ir` independent build;
- repository formatting and full TypeScript/Rust verification;
- the 17-project architecture dependency check;
- hosted TypeScript and Rust CI for the final revision;
- documentation consistency and deferred-scope audit.

The completion record in `CURRENT_STATUS.md` must name P0-W1-001, `p0-common-ir-v1`, the Canonical IR specification, the acceptance result, commands, counts, revision, schema impact, limitations, and next unblocked task.

## Documentation and traceability

Implementation updates `docs/handoff/specs/CANONICAL_IR.md` with the finalized coordinate, time, validation, and error conventions. The existing traceability relationship remains valid, but its P0-W1-001 fixture description should name `p0-common-ir-v1` explicitly. `CURRENT_STATUS.md` is updated only after local and hosted evidence exists.

These changes clarify and instantiate the existing Canonical IR contract. They do not change a frozen decision and therefore do not require an ADR. If implementation evidence shows that UTF-8 byte columns, opaque string identity, or exact-version behavior is incompatible with a governing contract, work stops for an evidence-driven design review rather than weakening fixtures.

## Failure and recovery

All operations in this task are pure validation or conversion. A failed parse returns no partially validated envelope and performs no mutation. There is no database, active graph, published knowledge, provider process, or external state to recover.

## Security and privacy

Typed errors do not retain complete rejected payloads. They retain only error codes, schema/version metadata, field paths, and bounded validation messages. No environment, filesystem, database, network, or secret access is introduced.
