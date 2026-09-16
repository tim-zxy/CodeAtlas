# P0-W1-004 Evidence Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add strict, provider-origin Evidence IR and independent Canonical Fact support relations, with executable multi-provider lifecycle Fixtures.

**Architecture:** Extend only dependency-bottom `@codeatlas/ir` with a branded Evidence ID, strict Evidence and relation records, and a pure state-transition validator. Reuse existing Provider/Canonical Fact references and Common IR envelopes; keep persistence, FactMerger, and cross-record integrity outside this task.

**Tech Stack:** TypeScript 7.0.2, Zod 4.6.1, Node 24, pnpm 11.19.0, Node test runner, and the existing Rust workspace Quality Gate.

**Spec:** `docs/superpowers/specs/2026-09-16-p0-w1-004-evidence-model-design.md`

## Global Constraints

- Task and acceptance are exactly `P0-W1-004` and `One canonical fact retains independent supports`; the Fixture ID is `p0-evidence-ir-v1`.
- The predecessor baseline is `27226c68d67fc78be49486a5f75b1bc93bc51ffc`; exact-SHA predecessor CI run `35074479854` succeeded. Do not treat historical pending wording in `CURRENT_STATUS.md` as an unmet gate.
- `@codeatlas/ir` imports no other project package. Provider Fact identity and Canonical Fact identity remain distinct, and Evidence remains separate from Claim and Knowledge.
- Evidence v1 sources are Provider Facts only. Status is exactly `ACTIVE | SUPERSEDED | INVALIDATED`; terminal records do not reactivate.
- IDs are exact, opaque, separately branded inputs. Do not derive Evidence IDs, FactKeys, support priority, or Canonical identity from names, Provider strings, or content.
- Public schemas are strict and JSON-safe; no arbitrary attributes bag, unknown-key stripping, explicit-undefined coercion, or raw rejected payload in typed errors.
- No database, migration, transaction, FactMerger, Provider execution, IPC, Knowledge, LLM, or other Deferred/Phase 0.5+ implementation.
- Use TDD for each code deliverable. Preserve prior Fixtures and Gates; failures are classified as implementation, Fixture, or design-assumption defects before correction.
- This plan authorizes local design and implementation only. Do not push or merge P0-W1-004 without separate user authorization.

## File map and task dependencies

| File | Responsibility | First task |
|---|---|---:|
| `packages/ir/src/evidence-identity.ts` | separately branded `EvidenceId` | 1 |
| `packages/ir/src/evidence.ts` | `EvidenceStatus`, strict `Evidence`, pure lifecycle helper | 1, 3 |
| `packages/ir/src/evidence-relations.ts` | strict `FactEvidence` and `ProviderFactBinding` | 2 |
| `packages/ir/src/index.ts` | explicit public exports | 1, 2, 3 |
| `packages/ir/test/evidence-ir.test.mjs` | Fixture runner, relationship, transition, envelope regressions | 1-4 |
| `packages/ir/type-test/evidence-brands.test.ts` | identity/reference assignability regressions | 4 |
| `fixtures/ir/evidence-v1/cases.json` | exact authoritative Fixture metadata | 1 |
| `fixtures/ir/evidence-v1/valid/cases.json` | valid records and independent support examples | 1, 2, 4 |
| `fixtures/ir/evidence-v1/invalid/cases.json` | typed first-path invalid examples | 1, 2, 4 |
| `package.json` | include Evidence test in root suite | 4 |
| `docs/handoff/specs/CANONICAL_IR.md` | normative Evidence v1 contract | 5 |
| `docs/handoff/DESIGN_TRACEABILITY.md` | exact task/Fixture/Acceptance/Spec mapping | 5 |
| `docs/handoff/CURRENT_STATUS.md` | fresh completion evidence and corrected predecessor CI state | 6 |

Tasks 1-3 define independently reviewable contracts. Task 4 integrates the full Fixture, brand, and envelope acceptance matrix. Task 5 synchronizes design authority; Task 6 runs completion gates and records actual evidence.

### Task 1: Evidence identity, status, record, and authoritative Fixture runner

**Files:**
- Create: `packages/ir/src/evidence-identity.ts`
- Create: `packages/ir/src/evidence.ts`
- Modify: `packages/ir/src/index.ts`
- Create: `packages/ir/test/evidence-ir.test.mjs`
- Create: `fixtures/ir/evidence-v1/cases.json`
- Create: `fixtures/ir/evidence-v1/valid/cases.json`
- Create: `fixtures/ir/evidence-v1/invalid/cases.json`

**Interfaces:**
- Consumes: `ProviderFactRefSchema`, `EntityIdSchema`, `parseIr`, and existing `IrValidationError` from `@codeatlas/ir`.
- Produces: `EvidenceIdSchema` / `EvidenceId`, `EvidenceStatusSchema` / `EvidenceStatus`, and `EvidenceSchema` / `Evidence`. Tasks 2-4 consume these exact names.

- [ ] **Step 1: Write the first executable Fixture and failing test**

Create the exact index before child loading:

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

The initial `valid/cases.json` is an array containing:

```json
{
  "id": "evidence-active-node-a",
  "target": "EVIDENCE",
  "input": {
    "id": "evidence:node-a",
    "repositoryId": "entity:repo-01",
    "revisionId": "entity:revision-01",
    "providerSnapshotId": "entity:snapshot-a",
    "providerFact": {
      "factType": "NODE",
      "providerId": "provider:a",
      "providerFactId": "provider-fact:node-a"
    },
    "status": "ACTIVE"
  }
}
```

The initial `invalid/cases.json` contains an `EVIDENCE` case with the same object but `status: "UNKNOWN"`, `errorCode: "IR_VALIDATION_FAILED"`, and `path: ["status"]`. The test file loads `cases.json`, asserts the complete index object before following either child path, and then parses child arrays:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as ir from '../dist/index.js';

const root = new URL('../../../fixtures/ir/evidence-v1/', import.meta.url);
const expectedIndex = {
  schemaVersion: 1,
  id: 'p0-evidence-ir-v1',
  task: 'P0-W1-004',
  governingSpec: 'docs/handoff/specs/CANONICAL_IR.md',
  acceptance: 'One canonical fact retains independent supports',
  validCases: 'valid/cases.json',
  invalidCases: 'invalid/cases.json',
};
const index = JSON.parse(await readFile(new URL('cases.json', root), 'utf8'));
assert.deepEqual(index, expectedIndex);
const validCases = JSON.parse(await readFile(new URL(index.validCases, root), 'utf8'));
const invalidCases = JSON.parse(await readFile(new URL(index.invalidCases, root), 'utf8'));
const parsers = { EVIDENCE: (input) => ir.parseIr(ir.EvidenceSchema, input) };

for (const fixture of validCases) {
  test('valid Evidence Fixture ' + fixture.id + ' round-trips', () => {
    const parsed = parsers[fixture.target](fixture.input);
    assert.deepEqual(parsed, fixture.input);
    assert.deepEqual(JSON.parse(JSON.stringify(parsed)), fixture.input);
  });
}
for (const fixture of invalidCases) {
  test('invalid Evidence Fixture ' + fixture.id + ' reports its first path', () => {
    assert.throws(() => parsers[fixture.target](fixture.input), (error) => {
      assert.ok(error instanceof ir.IrValidationError);
      assert.equal(error.code, fixture.errorCode);
      assert.deepEqual(error.issues[0].path, fixture.path);
      return true;
    });
  });
}
```

- [ ] **Step 2: Confirm RED**

Run `pnpm --filter @codeatlas/ir build` and `node --test packages/ir/test/evidence-ir.test.mjs`. The focused test must fail because `EvidenceSchema` is not exported; a test-harness or missing-file failure is not valid RED evidence.

- [ ] **Step 3: Implement the minimal schemas and exports**

Use a separately branded exact scalar in `evidence-identity.ts`:

```ts
import { z } from 'zod';

export const EvidenceIdSchema = z
  .string()
  .refine((value) => value.length > 0 && value.trim().length > 0 && value === value.trim(), {
    message: 'Evidence ID must be exact and non-blank',
  })
  .brand<'EvidenceId'>();
export type EvidenceId = z.infer<typeof EvidenceIdSchema>;
```

Use required strict fields in `evidence.ts`:

```ts
import { z } from 'zod';
import { ProviderFactRefSchema } from './code-fact-reference.js';
import { EvidenceIdSchema } from './evidence-identity.js';
import { EntityIdSchema } from './ids.js';

export const EvidenceStatusSchema = z.enum(['ACTIVE', 'SUPERSEDED', 'INVALIDATED']);
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;

export const EvidenceSchema = z.strictObject({
  id: EvidenceIdSchema,
  repositoryId: EntityIdSchema,
  revisionId: EntityIdSchema,
  providerSnapshotId: EntityIdSchema,
  providerFact: ProviderFactRefSchema,
  status: EvidenceStatusSchema,
});
export type Evidence = z.infer<typeof EvidenceSchema>;
```

Add explicit value and type exports for those three pairs to `packages/ir/src/index.ts`, following the existing export groups. Do not add a string-indexed metadata field.

- [ ] **Step 4: Confirm GREEN and boundary behavior**

Run `pnpm --filter @codeatlas/ir build`, then `node --test packages/ir/test/evidence-ir.test.mjs`. Add programmatic checks that blank/padded `EvidenceId`, unknown `status`, unknown object keys, missing required fields, and explicit `undefined` reject with `IR_VALIDATION_FAILED` and stable first paths. Re-run the same focused command and `pnpm --filter @codeatlas/ir test:types`.

- [ ] **Step 5: Commit the independently tested contract**

Run `git diff --check`, stage only the seven Task 1 paths, and commit with `git commit -m "feat: add provider-origin evidence IR"`. Record RED and GREEN counts for the task review.

### Task 2: Canonical support and Provider binding relations

**Files:**
- Create: `packages/ir/src/evidence-relations.ts`
- Modify: `packages/ir/src/index.ts`
- Modify: `packages/ir/test/evidence-ir.test.mjs`
- Modify: `fixtures/ir/evidence-v1/valid/cases.json`
- Modify: `fixtures/ir/evidence-v1/invalid/cases.json`

**Interfaces:**
- Consumes: Task 1 `EvidenceIdSchema`, existing `ProviderFactRefSchema` and `CanonicalFactRefSchema`.
- Produces: `FactEvidenceSchema` / `FactEvidence` and `ProviderFactBindingSchema` / `ProviderFactBinding`. Task 4 uses both in the independent-support scenario.

- [ ] **Step 1: Add failing relation Fixtures and checks**

Extend the test parser map with `FACT_EVIDENCE: (input) => ir.parseIr(ir.FactEvidenceSchema, input)` and `PROVIDER_FACT_BINDING: (input) => ir.parseIr(ir.ProviderFactBindingSchema, input)`. Add valid records that refer to `evidence:node-a` and one Canonical NODE fact:

```json
{
  "id": "fact-evidence-node-a",
  "target": "FACT_EVIDENCE",
  "input": {
    "fact": { "factType": "NODE", "id": "canonical:node-01" },
    "evidenceId": "evidence:node-a"
  }
}
```

```json
{
  "id": "provider-binding-node-a",
  "target": "PROVIDER_FACT_BINDING",
  "input": {
    "providerFact": {
      "factType": "NODE",
      "providerId": "provider:a",
      "providerFactId": "provider-fact:node-a"
    },
    "providerSnapshotId": "entity:snapshot-a",
    "canonicalFact": { "factType": "NODE", "id": "canonical:node-01" },
    "evidenceId": "evidence:node-a"
  }
}
```

Add an invalid binding with `canonicalFact.factType: "EDGE"` and declared first path `["canonicalFact", "factType"]`; add a swapped Provider-object-as-Canonical-reference invalid case with path under `["canonicalFact"]`. Add negative checks for unknown fields and blank Evidence IDs. The existing Fixture loops must continue to parse all cases.

- [ ] **Step 2: Confirm RED**

Run `pnpm --filter @codeatlas/ir build` and `node --test packages/ir/test/evidence-ir.test.mjs`. The new relation cases must fail for missing public schemas, while Task 1 cases stay green.

- [ ] **Step 3: Implement strict relations**

```ts
import { z } from 'zod';
import { CanonicalFactRefSchema, ProviderFactRefSchema } from './code-fact-reference.js';
import { EvidenceIdSchema } from './evidence-identity.js';
import { EntityIdSchema } from './ids.js';

export const FactEvidenceSchema = z.strictObject({
  fact: CanonicalFactRefSchema,
  evidenceId: EvidenceIdSchema,
});
export type FactEvidence = z.infer<typeof FactEvidenceSchema>;

export const ProviderFactBindingSchema = z
  .strictObject({
    providerFact: ProviderFactRefSchema,
    providerSnapshotId: EntityIdSchema,
    canonicalFact: CanonicalFactRefSchema,
    evidenceId: EvidenceIdSchema,
  })
  .superRefine((binding, context) => {
    if (binding.providerFact.factType !== binding.canonicalFact.factType) {
      context.addIssue({
        code: 'custom',
        path: ['canonicalFact', 'factType'],
        message: 'Provider and Canonical fact types must match',
      });
    }
  });
export type ProviderFactBinding = z.infer<typeof ProviderFactBindingSchema>;
```

Export both schema/type pairs from `index.ts`. Do not add a public aggregate support-set validator, automatic dereference, or storage lookup.

- [ ] **Step 4: Confirm GREEN and relation isolation**

Run the focused Evidence test and IR type compilation. Verify NODE and EDGE relation variants, exact JSON round-trips, mismatched fact types, unknown fields, and swapped reference shapes. The tests must establish Provider/Canonical separation without pretending a raw string prefix proves identity.

- [ ] **Step 5: Commit**

Run `git diff --check`; stage only Task 2 paths and commit `git commit -m "feat: add evidence support relations"`.

### Task 3: Pure Evidence lifecycle transition

**Files:**
- Modify: `packages/ir/src/evidence.ts`
- Modify: `packages/ir/src/index.ts`
- Modify: `packages/ir/test/evidence-ir.test.mjs`

**Interfaces:**
- Consumes: Task 1 `EvidenceSchema`, `Evidence`, existing `parseIr` and `IrValidationError`.
- Produces: `validateEvidenceTransition(previous: unknown, next: unknown): Evidence`.

- [ ] **Step 1: Write a failing transition matrix**

Use the `evidence-active-node-a` valid fixture as `previous`. Write cases for idempotent `ACTIVE`, `ACTIVE -> SUPERSEDED`, `ACTIVE -> INVALIDATED`, idempotent terminal states, forbidden reactivation, and forbidden `SUPERSEDED <-> INVALIDATED` changes:

```js
const active = validCases.find(({ id }) => id === 'evidence-active-node-a').input;
test('Evidence transitions keep source identity and terminal status', () => {
  assert.deepEqual(ir.validateEvidenceTransition(active, { ...active, status: 'SUPERSEDED' }), {
    ...active,
    status: 'SUPERSEDED',
  });
  assert.deepEqual(ir.validateEvidenceTransition(active, { ...active, status: 'INVALIDATED' }), {
    ...active,
    status: 'INVALIDATED',
  });
  assert.deepEqual(ir.validateEvidenceTransition(active, active), active);
  const superseded = { ...active, status: 'SUPERSEDED' };
  assert.deepEqual(ir.validateEvidenceTransition(superseded, superseded), superseded);
  assert.throws(
    () => ir.validateEvidenceTransition(superseded, active),
    (error) => error.code === 'IR_VALIDATION_FAILED'
      && JSON.stringify(error.issues[0].path) === JSON.stringify(['next', 'status']),
  );
});
```

Add one case for each immutable field: `id`, `repositoryId`, `revisionId`, `providerSnapshotId`, and each nested `providerFact` member (`factType`, `providerId`, `providerFactId`). Use another valid opaque value for each mutation. Assert exact `['next', field]` or `['next', 'providerFact', member]` first paths. Prove invalid previous and invalid next objects are parsed before transition policy. Cover `INVALIDATED -> ACTIVE`, `SUPERSEDED -> INVALIDATED`, and `INVALIDATED -> SUPERSEDED` separately.

- [ ] **Step 2: Confirm RED**

Run `pnpm --filter @codeatlas/ir build` and `node --test packages/ir/test/evidence-ir.test.mjs`; the new transition cases must fail for the missing export.

- [ ] **Step 3: Implement the pure transition**

```ts
import { IrValidationError } from './errors.js';
import { parseIr } from './validation.js';

function evidenceTransitionError(path: readonly (string | number)[], message: string): never {
  throw new IrValidationError([{ path: ['next', ...path], message }]);
}

export function validateEvidenceTransition(previous: unknown, next: unknown): Evidence {
  const before = parseIr(EvidenceSchema, previous);
  const after = parseIr(EvidenceSchema, next);
  if (before.id !== after.id) evidenceTransitionError(['id'], 'Evidence ID cannot change');
  if (before.repositoryId !== after.repositoryId)
    evidenceTransitionError(['repositoryId'], 'Evidence repository ID cannot change');
  if (before.revisionId !== after.revisionId)
    evidenceTransitionError(['revisionId'], 'Evidence revision ID cannot change');
  if (before.providerSnapshotId !== after.providerSnapshotId)
    evidenceTransitionError(['providerSnapshotId'], 'Evidence snapshot ID cannot change');
  for (const field of ['factType', 'providerId', 'providerFactId'] as const) {
    if (before.providerFact[field] !== after.providerFact[field])
      evidenceTransitionError(['providerFact', field], 'Evidence Provider Fact cannot change');
  }
  if (before.status !== 'ACTIVE' && before.status !== after.status)
    evidenceTransitionError(['status'], 'Terminal Evidence status cannot change');
  return after;
}
```

Add the function export to `index.ts`. Keep the helper side-effect-free; do not query successor records, ProviderSnapshot outcome, storage, or Canonical Fact state.

- [ ] **Step 4: Confirm GREEN and commit**

Run the focused Evidence runtime test, the IR type suite, and `git diff --check`. Stage only Task 3 paths and commit `git commit -m "feat: validate evidence lifecycle transitions"`.

### Task 4: Complete multi-support, envelope, and brand acceptance

**Files:**
- Modify: `fixtures/ir/evidence-v1/valid/cases.json`
- Modify: `fixtures/ir/evidence-v1/invalid/cases.json`
- Modify: `packages/ir/test/evidence-ir.test.mjs`
- Create: `packages/ir/type-test/evidence-brands.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Tasks 1-3 public exports and both Common envelope APIs.
- Produces: complete executable `p0-evidence-ir-v1`, permanent brand/envelope regressions, and root test registration.

- [ ] **Step 1: Extend the Fixture to two independent supports**

Add `evidence-active-node-b` from `provider:b` and `entity:snapshot-b`, with a distinct `evidence:node-b` ID and `ACTIVE` status. Add `evidence-superseded-node-a` and `evidence-invalidated-node-a` as separate valid status shapes for `evidence:node-a`; they are alternative observations for transition tests, not simultaneous duplicate rows. Add `fact-evidence-node-b` and `provider-binding-node-b`, both pointing to `canonical:node-01`. Add one EDGE Evidence, FactEvidence, and ProviderFactBinding chain so both `factType` variants are exercised.

Add invalid cases for each required field missing, explicit wrong type, unknown key, unknown status, blank/padded Evidence ID, malformed Provider/Canonical references, and binding type mismatch. Every JSON case declares a stable first issue path. Do not duplicate fixture IDs or weaken Task 1-2 cases.

- [ ] **Step 2: Prove the independent-support scenario in a focused test**

Parse six named NODE records from the valid fixture array and assert the two Evidence IDs and Provider IDs remain distinct while both `FactEvidence.fact` values equal the same Canonical reference:

```js
function validInput(id) {
  const fixture = validCases.find((entry) => entry.id === id);
  assert.ok(fixture, 'Fixture must exist: ' + id);
  return fixture.input;
}
test('one Canonical Fact retains two independent Provider supports', () => {
  const evidence = ['evidence-active-node-a', 'evidence-active-node-b']
    .map((id) => ir.parseIr(ir.EvidenceSchema, validInput(id)));
  const links = ['fact-evidence-node-a', 'fact-evidence-node-b']
    .map((id) => ir.parseIr(ir.FactEvidenceSchema, validInput(id)));
  const bindings = ['provider-binding-node-a', 'provider-binding-node-b']
    .map((id) => ir.parseIr(ir.ProviderFactBindingSchema, validInput(id)));
  assert.notEqual(evidence[0].id, evidence[1].id);
  assert.notEqual(evidence[0].providerFact.providerId, evidence[1].providerFact.providerId);
  assert.deepEqual(links.map((row) => row.fact), [
    { factType: 'NODE', id: 'canonical:node-01' },
    { factType: 'NODE', id: 'canonical:node-01' },
  ]);
  assert.deepEqual(bindings.map((row) => row.evidenceId), evidence.map((row) => row.id));
  assert.deepEqual(links.map((row) => row.evidenceId), evidence.map((row) => row.id));
  assert.deepEqual(evidence.map((row) => row.status), ['ACTIVE', 'ACTIVE']);
  const superseded = ir.validateEvidenceTransition(evidence[0], {
    ...evidence[0], status: 'SUPERSEDED',
  });
  assert.deepEqual([superseded.status, evidence[1].status], ['SUPERSEDED', 'ACTIVE']);
});
```

This is a representation test. Do not assert that the Canonical Fact's lifetime or Confidence was recomputed.

- [ ] **Step 3: Add three independent version-1 envelope matrices**

For `Evidence`, `FactEvidence`, and `ProviderFactBinding`, supply test-local descriptors named `codeatlas.fixture.evidence.evidence`, `codeatlas.fixture.evidence.fact-evidence`, and `codeatlas.fixture.evidence.provider-fact-binding`, each with version `1` and its exact payload schema. Use an invalid Fixture from `invalidCases` for each target; do not pass an invalid ID to a valid-Fixture lookup. For both APIs, assert a valid Fixture JSON-round-trips and a structured invalid Fixture fails with `IR_VALIDATION_FAILED` at `['payload']`. With `parseSchemaEnvelope`, assert wrong schema plus wrong version plus invalid payload yields `SCHEMA_MISMATCH`, then correct schema plus wrong version plus invalid payload yields `UNSUPPORTED_SCHEMA_VERSION`, then correct schema/version plus invalid payload yields `IR_VALIDATION_FAILED` at `['payload']`. With `createSchemaEnvelopeSchema` through `parseIr`, assert the corresponding `IR_VALIDATION_FAILED` first issue paths are `['schema']`, `['version']`, and `['payload']`; this API has one validation error code rather than specialized mismatch/version classes. Do not infer precedence from the other API's results.

- [ ] **Step 4: Write brand and reference type regressions**

In `evidence-brands.test.ts`, use schema parsing to obtain branded values, then negative assignments:

```ts
import {
  CanonicalIdSchema,
  EntityIdSchema,
  EvidenceIdSchema,
  ProviderFactIdSchema,
  ProviderIdSchema,
  type CanonicalId,
  type EntityId,
  type EvidenceId,
  type ProviderFactId,
} from '../src/index.js';

const evidenceId: EvidenceId = EvidenceIdSchema.parse('evidence:one');
const entityId: EntityId = EntityIdSchema.parse('entity:one');
const providerFactId: ProviderFactId = ProviderFactIdSchema.parse('provider-fact:one');
const canonicalId: CanonicalId = CanonicalIdSchema.parse('canonical:one');
ProviderIdSchema.parse('provider:one');
// @ts-expect-error EvidenceId is not EntityId
const mistakenEntity: EntityId = evidenceId;
// @ts-expect-error EntityId is not EvidenceId
const mistakenEvidence: EvidenceId = entityId;
// @ts-expect-error ProviderFactId is not EvidenceId
const mistakenProviderEvidence: EvidenceId = providerFactId;
// @ts-expect-error CanonicalId is not EvidenceId
const mistakenCanonicalEvidence: EvidenceId = canonicalId;
void [mistakenEntity, mistakenEvidence, mistakenProviderEvidence, mistakenCanonicalEvidence];
```

Also test `ProviderFactRef` and `CanonicalFactRef` cannot be swapped in `FactEvidence` or `ProviderFactBinding`. Run `pnpm --filter @codeatlas/ir test:types` first to ensure each `@ts-expect-error` is actually consumed.

- [ ] **Step 5: Register and verify the complete Fixture**

Append `packages/ir/test/evidence-ir.test.mjs` to the existing root `test` script's Node `--test` file list in `package.json`; preserve every existing test path. Run `pnpm --filter @codeatlas/ir build`, focused Evidence test, type tests, and root `pnpm test`. Capture actual Fixture and test counts. Run `git diff --check`; stage only Task 4 paths and commit `git commit -m "test: prove independent evidence supports"`.

### Task 5: Synchronize normative IR and traceability

**Files:**
- Modify: `docs/handoff/specs/CANONICAL_IR.md`
- Modify: `docs/handoff/DESIGN_TRACEABILITY.md`

**Interfaces:**
- Consumes: reviewed public exports and actual Fixture paths from Tasks 1-4.
- Produces: authoritative Evidence v1 field/lifecycle specification and one updated P0-W1-004 task row. Task 6 cites both.

- [ ] **Step 1: Add the normative Evidence section**

Add a section after Code IR specifying all five exported schema/type pairs and the `validateEvidenceTransition` function, the exact strict record fields from the approved spec, `ACTIVE | SUPERSEDED | INVALIDATED` semantics, the pure transition table and immutable source tuple, and the `['canonicalFact', 'factType']` mismatch path. State explicitly that FactEvidence and ProviderFactBinding remain separate relations, two Providers may support one Canonical Fact, cross-record integrity and support-based lifetime are later responsibilities, and no Evidence variant other than Provider Fact is accepted in v1.

- [ ] **Step 2: Update the existing traceability row**

Replace only P0-W1-004's generic row with one that names `fixtures/ir/evidence-v1/cases.json` and its two child paths, `packages/ir/test/evidence-ir.test.mjs`, `packages/ir/type-test/evidence-brands.test.ts`, the unchanged acceptance text `One canonical fact retains independent supports`, `docs/handoff/specs/CANONICAL_IR.md`, and ADR-002/ADR-006 with ADR-012 as Fixture gate authority. Do not mark SQLite Schema as implemented by this pure-IR task.

- [ ] **Step 3: Review scope and commit**

Run `pnpm exec prettier --check docs/handoff/specs/CANONICAL_IR.md docs/handoff/DESIGN_TRACEABILITY.md`, the focused Evidence suite, and `git diff --check`. Verify no accepted ADR, Phase Acceptance threshold, migration, IPC registry, or older Fixture changed. Stage only the two authority documents and commit `git commit -m "docs: specify evidence IR and traceability"`.

### Task 6: Full Quality Gate, status evidence, and handoff

**Files:**
- Modify: `docs/handoff/CURRENT_STATUS.md`

**Interfaces:**
- Consumes: Tasks 1-5 commits, `p0-evidence-ir-v1`, ADR-002/006/012, and the exact predecessor CI evidence.
- Produces: local completion record with actual commands/counts, Guardrail/Deferred audit, and next task P0-W1-005; hosted completion remains conditional on separate push authorization and exact-SHA CI.

- [ ] **Step 1: Run all local acceptance commands**

Run `node --test packages/ir/test/evidence-ir.test.mjs`, `pnpm --filter @codeatlas/ir test:types`, `pnpm verify`, and `git diff --check` in the Evidence worktree. `pnpm verify` must include formatting, 16 TypeScript project builds, the root Node suite, 17-project architecture check, Rust formatting/build/Clippy with denied warnings, and Rust tests. A failing command stops completion; do not lower a Gate or delete a Fixture.

- [ ] **Step 2: Audit architecture, scope, and failure boundaries**

Check the implementation range from `27226c6` with `git diff --name-only 27226c6..HEAD`. Search new `packages/ir/src` files for project imports, storage/SQL, graph activation, FactMerger, LLM/Knowledge, Provider execution, and arbitrary attributes bags using Windows-safe `rg -g` filters. Confirm no public schema has a Provider-native payload bag, no direct DB write exists, and no previous Canonical Graph or Published Knowledge can be mutated by these pure parsers. Confirm the entire old Common/Source/Code Fixture set still passes.

- [ ] **Step 3: Update CURRENT_STATUS from fresh evidence**

Correct the stale P0-W1-003 pending-CI summary: exact-SHA run `35074479854` succeeded for `27226c68d67fc78be49486a5f75b1bc93bc51ffc`. Add P0-W1-004 with its task ID, branch and verified implementation SHA, ADR/spec/Acceptance, Fixture index and child paths, actual valid/invalid counts, focused/type/root counts, architecture and Rust results, error/recovery behavior, Deferred audit, unchanged migration/schema boundary, and next task `P0-W1-005 Migration runner`. If the new branch has not been pushed, say hosted CI is pending and do not claim full hosted completion.

- [ ] **Step 4: Commit status and verify clean local state**

Run the formatter check on the changed status file and `git diff --check`; stage only `CURRENT_STATUS.md`, commit `git commit -m "docs: record evidence IR verification"`, and confirm `git status --short` is empty. A status-only commit cannot record its own future CI run; report that exact result in the final handoff if the user authorizes a push.

- [ ] **Step 5: Obtain explicit push decision and hosted evidence**

Do not push by inference. If the user authorizes pushing `codex/p0-w1-004-evidence-model`, push that named branch, wait for GitHub Actions `CI` on the exact final SHA, confirm both TypeScript and Rust jobs succeed, and verify local HEAD/upstream/remote ref equality. Do not merge or push `main` unless separately directed. If authorization is withheld, preserve the branch and report local verification with hosted completion pending.
