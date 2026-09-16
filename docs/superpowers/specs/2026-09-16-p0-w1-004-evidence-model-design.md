# P0-W1-004 Evidence Model Design

**Status:** Draft for user review

**Date:** 2026-09-16

**Task:** P0-W1-004 Evidence model

**Governing authority:** ADR-002, ADR-006, ADR-012, `docs/handoff/specs/CANONICAL_IR.md`, `docs/handoff/specs/SQLITE_SCHEMA.md`, `docs/handoff/PHASE_ACCEPTANCE.md`, and `docs/handoff/DESIGN_TRACEABILITY.md`

## Purpose and boundary

Define strict, provider-origin Evidence and its two independent relations to Canonical Code Facts. One Canonical Fact must be representable with multiple distinct supports whose lifecycle states are independent. This is a pure, versioned `@codeatlas/ir` contract: it validates supplied observations and a single Evidence state transition but does not create, merge, persist, activate, or publish facts.

P0-W1-001 and P0-W1-003 are predecessors. The exact-SHA P0-W1-003 CI run `35074479854` passed on `27226c68d67fc78be49486a5f75b1bc93bc51ffc`. The older pending-CI wording in `CURRENT_STATUS.md` is a historical documentation gap to correct during P0-W1-004 closure, not an unmet predecessor gate.

## Compatibility and governance

This is a compatible field-level elaboration of provider-independent Canonical IR and the Evidence/Claim/Knowledge separation in ADR-002 and ADR-006. ADR-012 requires executable Fixtures and fresh gate evidence. No accepted ADR or frozen invariant changes. There is no existing Evidence v1 schema to migrate, and this task introduces no database migration or version adapter.

- Provider Facts and Canonical Facts remain distinct; a Provider ID never becomes Canonical identity.
- Evidence is an independently identified observation, not a Claim, KnowledgeCandidate, or published KnowledgeRevision.
- A source observation can become non-active without deleting another independent support or resolving an ambiguous target.
- SQLite remains the future authoritative store. This task neither owns nor writes it.
- `@codeatlas/ir` remains dependency-bottom and imports no project package.

## Scope

Included: `EvidenceId`, `EvidenceStatus`, `Evidence`, `FactEvidence`, `ProviderFactBinding`, a pure `validateEvidenceTransition` helper, strict version-1 envelope coverage, executable Fixtures, and TypeScript brand tests.

Excluded: Provider execution, Evidence creation policy, identity derivation or hashing, source/document/human Evidence variants, FactKey computation, canonicalization, FactMerger, Confidence aggregation, support-based fact lifetime, graph-wide uniqueness, cross-record referential integrity, SQLite tables or migrations, staging, activation, Claim/Knowledge compilation, LLM, and all Phase 0.5+ capabilities. Later source kinds require an explicit compatible contract or a new schema version; an arbitrary `EntityRef` or attributes bag is not a substitute.

P0-W1-006 owns the repository Evidence migration and persistence checks. P05-W4-002 owns support recomputation and Canonical Fact lifetime. The application/storage boundary later enforces transactional consistency across relation rows.

## Proposed file structure

```text
packages/ir/src/
  evidence-identity.ts       # EvidenceId only
  evidence.ts                # EvidenceStatus, Evidence, pure transition
  evidence-relations.ts      # FactEvidence and ProviderFactBinding
  index.ts                   # explicit public exports
packages/ir/test/
  evidence-ir.test.mjs
packages/ir/type-test/
  evidence-brands.test.ts
fixtures/ir/evidence-v1/
  cases.json
  valid/cases.json
  invalid/cases.json
```

No existing Provider or Canonical Fact shape changes. The fixture's multi-support scenario is test data, not a new public aggregate type.

## Wire contracts

`EvidenceIdSchema` / `EvidenceId` is a separately branded, exact opaque string. Like existing IR identity scalars, it rejects empty, blank, and surrounding-whitespace values; parsing neither trims nor derives an ID from Provider identity, names, source text, or model output. It is not assignable to `EntityId`, `CanonicalId`, or `ProviderFactId` without explicit runtime validation.

`EvidenceStatusSchema` / `EvidenceStatus` is exactly `ACTIVE | SUPERSEDED | INVALIDATED`. `ACTIVE` means the observation is available as support; `SUPERSEDED` means a later observation replaced it without asserting the older observation was false; `INVALIDATED` means it must not be treated as reliable support. Both non-active values retain provenance rather than deleting it. Status alone never computes a Canonical Fact's existence or Confidence.

The strict, schema-inferred public records are:

```ts
interface Evidence {
  id: EvidenceId;
  repositoryId: EntityId;
  revisionId: EntityId;
  providerSnapshotId: EntityId;
  providerFact: ProviderFactRef;
  status: EvidenceStatus;
}

interface FactEvidence {
  fact: CanonicalFactRef;
  evidenceId: EvidenceId;
}

interface ProviderFactBinding {
  providerFact: ProviderFactRef;
  providerSnapshotId: EntityId;
  canonicalFact: CanonicalFactRef;
  evidenceId: EvidenceId;
}
```

Every field is required. Unknown keys and explicit `undefined` are invalid. `ProviderFactBinding.providerFact.factType` and `canonicalFact.factType` must match; the mismatch path is `['canonicalFact', 'factType']`. `FactEvidence` contains Canonical identity only, while `ProviderFactBinding` preserves both Provider and Canonical identities. The latter names an Evidence ID and snapshot so that a Provider Fact observed in multiple snapshots does not silently collapse into one support.

`Evidence` deliberately does not duplicate Provider Fact `Confidence`, SourceRange, or ProviderSnapshot timestamps. Those remain on their already-versioned source records, and this task does not infer or aggregate them. It also does not copy raw Provider payloads, source text, diagnostic prose, or arbitrary metadata.

Multiple `Evidence` records with distinct IDs may point to Provider Facts from different Providers and connect through separate `FactEvidence` rows to the same `CanonicalFactRef`. `ProviderFactBinding` supplies the provider-specific mapping for each support. Neither relation embeds support arrays in a Canonical Fact, chooses one Provider as authority, or changes Canonical identity. Relation-row tuple uniqueness and referenced-record existence are not properties of an individual wire object and are deferred to the repository store. Test fixtures assert coherent sets without introducing a public support-set validator.

## Pure lifecycle transition

`validateEvidenceTransition(previous: unknown, next: unknown): Evidence` parses both inputs and returns the validated `next` or throws `IrValidationError`. It performs no I/O, mutation, clock read, or persistence.

For one Evidence ID, `repositoryId`, `revisionId`, `providerSnapshotId`, and the exact `providerFact` tuple are immutable. A change to any of those fields is rejected under `['next', ...]`; identity and provenance checks precede status checks. Same-status observations are idempotent. `ACTIVE -> SUPERSEDED` and `ACTIVE -> INVALIDATED` are allowed. `SUPERSEDED` and `INVALIDATED` are terminal: no reactivation or cross-terminal transition is allowed. A new observation must use a new Evidence ID rather than recycling a terminal record.

The helper validates a declared transition, not whether a replacement Evidence record actually exists or whether a ProviderSnapshot succeeded. Those require later cross-record and application/storage context. Failure returns no partially accepted Evidence.

## Validation and versioning

All schemas are strict and JSON-safe, reuse the existing `parseIr` typed-error boundary, and preserve exact accepted values. Invalid brands, enums, fields, fact-type mismatch, and transitions yield `IR_VALIDATION_FAILED` with structured paths and controlled messages of at most 128 characters that never echo rejected values. Envelope schema and version disagreements retain `SCHEMA_MISMATCH` and `UNSUPPORTED_SCHEMA_VERSION`. No coercion, unknown-key stripping, silent status promotion, or best-effort relationship repair is allowed.

Tests use explicit version-1 descriptors for `Evidence`, `FactEvidence`, and `ProviderFactBinding` through both `parseSchemaEnvelope` and `createSchemaEnvelopeSchema`. Each proves JSON round-trip, structured-payload rejection, and schema-before-version-before-payload precedence. These descriptors are test-local; this task creates no production IPC registry or schema adapter.

## Fixture and acceptance

The authoritative executable Fixture index is:

```json
{
  "schemaVersion": 1,
  "id": "p0-evidence-ir-v1",
  "task": "P0-W1-004",
  "governingSpec": "docs/handoff/specs/CANONICAL_IR.md",
  "acceptance": "One canonical fact retains independent supports",
  "validCases": "valid/cases.json",
  "invalidCases": "invalid/cases.json"
}
```

The runner validates this metadata before loading either child path and resolves children only through the index. Valid fixtures cover all three statuses, both NODE and EDGE references, nullable-free exact wire shapes, three payload envelopes, and one coherent scenario where two Provider Facts from different Providers/Snapshots support one Canonical Fact through distinct Evidence IDs and relation rows. One support can be non-active while the other remains `ACTIVE`; round-trip must preserve both IDs, rows, and statuses in their original order. This proves representability and independent lifecycle, not FactMerger's later fact-lifetime decision.

Invalid fixtures and focused tests cover missing/unknown fields; wrong, blank, or padded IDs; swapped Provider/Canonical references; binding fact-type mismatch; unknown status; structured envelope payloads; status reversal or cross-terminal transition; changed identity, repository, revision, snapshot, or Provider Fact source; and stable first issue paths. Brand tests reject accidental cross-family assignments. JSON fixtures cannot encode explicit `undefined`, so programmatic tests cover required-field `undefined` separately.

No Fixture may be deleted or weakened to make a Gate pass. A failure must be classified as implementation, Fixture, or design-assumption error before correction.

## Quality Gates and documentation

Completion requires focused Evidence runtime/brand tests and `p0-evidence-ir-v1`; Common, Source/Revision, and Code Fact regressions; full `pnpm verify` (format, 16 TypeScript builds, Node tests, 17-project architecture check, Rust format/build/Clippy/tests); `git diff --check`; explicit guardrail/Deferred audit; and, if pushing is separately authorized, exact-SHA hosted CI. Record actual counts rather than predicted totals.

Implementation synchronizes the Evidence section of `docs/handoff/specs/CANONICAL_IR.md`, the P0-W1-004 row in `docs/handoff/DESIGN_TRACEABILITY.md`, and `docs/handoff/CURRENT_STATUS.md` with commands, Fixture counts, SHA, limits, and the next unblocked task. It also corrects the historical pending-P0-W1-003-CI wording using the verified exact-SHA run. A genuine frozen-decision conflict stops implementation for an ADR or Design Change Proposal with affected specs, acceptance, Fixture, and traceability updates.
