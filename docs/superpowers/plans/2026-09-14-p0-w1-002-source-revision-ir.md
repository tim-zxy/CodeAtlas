# P0-W1-002 Source and Revision IR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the provider-independent Repository, Revision, SourceFile, and ProviderSnapshot contracts and prove mutable worktree identity differs from immutable revision identity.

**Architecture:** Add strict schema-first Source IR only to dependency-bottom `@codeatlas/ir`. Pure validators enforce revision transition and ProviderSnapshot revision matching; the task performs no discovery, hashing, provider execution, persistence, or activation.

**Tech Stack:** TypeScript 7.0.2, Node.js 24, Zod 4.6.1, Node test runner, JSON Fixtures, pnpm 11.19.0, existing Rust and architecture gates.

**Spec:** `docs/superpowers/specs/2026-09-14-p0-w1-002-source-revision-ir-design.md`

## Global Constraints

- Preserve provider-independent Canonical IR and opaque stable EntityId/CanonicalId semantics.
- `@codeatlas/ir` must not import another `@codeatlas/*` package.
- Zod schemas are executable contracts; exported TypeScript types are inferred and public objects are strict and JSON-safe.
- Repository roots, relative paths, fingerprints, commit identities, Provider IDs, and versions are exact non-blank strings; validation rejects rather than trims or rewrites.
- Repository-relative paths use `/` and reject absolute forms, `\\`, NUL, empty segments, `.`, `..`, leading/trailing `/`, and surrounding whitespace.
- `WORKTREE` keeps one revision identity while its fingerprint/base may change. `COMMIT` and `SNAPSHOT` are immutable under one identity.
- SourceFile identity is stable for one logical repository path across revisions; rename remains delete plus add.
- SourceFile classification is orthogonal: role `SOURCE | TEST | OTHER`, provenance `AUTHORED | GENERATED | VENDOR`, content kind `TEXT | BINARY`.
- Sensitivity is exactly `PUBLIC | INTERNAL | SENSITIVE | SECRET`.
- Provider IDs never masquerade as EntityId or CanonicalId. ProviderSnapshot is observation history, not Canonical activation.
- ProviderSnapshot matching requires repository ID, revision ID, and requested fingerprint equality.
- Public failures reuse `IR_VALIDATION_FAILED`, structured paths, bounded controlled messages, and never retain raw rejected payloads.
- Do not add Workspace/RevisionSet, discovery, scanning, hash computation, Provider SPI, Fact Merge, Code Fact, Evidence, SQLite, IPC, Java, graph, Knowledge, LLM, embedding, network, watcher, daemon, or Phase 1+ behavior.
- Do not weaken or delete an existing test, Fixture, Quality Gate, or architecture check.
- Fixture ID is exactly `p0-source-revision-ir-v1`; task is `P0-W1-002`; governing spec is `docs/handoff/specs/CANONICAL_IR.md`; acceptance is `Mutable and immutable revision semantics differ`.

---

### Task 1: Source identity scalars and Repository

**Files:**

- Create: `packages/ir/src/source-identity.ts`
- Create: `packages/ir/src/repository.ts`
- Create: `packages/ir/test/source-revision-ir.test.mjs`
- Create: `packages/ir/type-test/source-revision-brands.test.ts`
- Create: `fixtures/ir/source-revision-v1/cases.json`
- Create: `fixtures/ir/source-revision-v1/valid/cases.json`
- Create: `fixtures/ir/source-revision-v1/invalid/cases.json`
- Modify: `packages/ir/src/index.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: `EntityIdSchema`, `CanonicalIdSchema`, `parseIr`, and Common IR typed errors.
- Produces: `RepositoryRootPathSchema`, `RepositoryRelativePathSchema`, `ContentFingerprintSchema`, `CommitIdentitySchema`, `ProviderIdSchema`, `ProviderVersionSchema`, `RuntimeVersionSchema`, their inferred branded types, and `RepositorySchema` / `Repository`.

- [ ] **Step 1: Create the Fixture index and Repository cases**

Create `cases.json` with exact metadata:

```json
{
  "schemaVersion": 1,
  "id": "p0-source-revision-ir-v1",
  "task": "P0-W1-002",
  "governingSpec": "docs/handoff/specs/CANONICAL_IR.md",
  "acceptance": "Mutable and immutable revision semantics differ",
  "validCases": "valid/cases.json",
  "invalidCases": "invalid/cases.json"
}
```

Start the valid cases with these exact Repository/scalar behaviors:

```json
[
  {
    "id": "repository-basic",
    "target": "REPOSITORY",
    "input": { "id": "entity:repo-01", "rootPath": "D:/workspace/project" }
  },
  {
    "id": "repository-relocated-same-id",
    "target": "REPOSITORY",
    "input": { "id": "entity:repo-01", "rootPath": "E:/moved/project" }
  },
  { "id": "relative-path-basic", "target": "REPOSITORY_RELATIVE_PATH", "input": "src/main.ts" }
]
```

Start invalid cases with exact IDs and paths for blank/padded roots plus absolute, drive-absolute, backslash, NUL, empty-segment, dot-segment, parent-segment, and trailing-slash relative paths. Each uses `IR_VALIDATION_FAILED` and path `[]`, except invalid Repository fields, which use `['rootPath']` or `[]` for an unknown key.

- [ ] **Step 2: Write the Fixture runner and brand tests**

Use a namespace import so later task exports can be added without making this task's runner unloadable:

```js
import * as ir from '../dist/index.js';

const parsers = {
  REPOSITORY: (input) => ir.parseIr(ir.RepositorySchema, input),
  REPOSITORY_RELATIVE_PATH: (input) => ir.parseIr(ir.RepositoryRelativePathSchema, input),
};
```

For every valid case, parse, `JSON.stringify`, JSON-parse, parse again, and `assert.deepEqual`. For every invalid case, assert `IrContractError`, exact `error.code`, and the declared issue path when present. Add a programmatic regression proving `{ id, rootPath, extra: true }` is rejected rather than stripped.

In `source-revision-brands.test.ts`, parse one value for each new brand and add `@ts-expect-error` calls proving RepositoryRelativePath, ContentFingerprint, ProviderId, EntityId, and CanonicalId are pairwise non-interchangeable at representative boundaries.

- [ ] **Step 3: Run the focused RED checks**

Run:

```powershell
pnpm --filter @codeatlas/ir build
node --test --test-name-pattern="repository|source identity|relative path" packages/ir/test/source-revision-ir.test.mjs
pnpm --filter @codeatlas/ir test:types
```

Expected: runtime checks fail because Repository/scalar exports are absent; type compilation fails because the branded exports are absent. Record both failures before modifying production source.

- [ ] **Step 4: Implement exact branded strings and relative-path validation**

In `source-identity.ts`, define one internal exact-string factory and export distinct branded schemas:

```ts
import { z } from 'zod';

function exactNonBlankString(label: string) {
  return z.string().refine(
    (value) => value.length > 0 && value.trim().length > 0 && value === value.trim(),
    { message: `${label} must be exact and non-blank` },
  );
}

export const RepositoryRootPathSchema = exactNonBlankString('Repository root path').brand<'RepositoryRootPath'>();
export const ContentFingerprintSchema = exactNonBlankString('Content fingerprint').brand<'ContentFingerprint'>();
export const CommitIdentitySchema = exactNonBlankString('Commit identity').brand<'CommitIdentity'>();
export const ProviderIdSchema = exactNonBlankString('Provider ID').brand<'ProviderId'>();
export const ProviderVersionSchema = exactNonBlankString('Provider version').brand<'ProviderVersion'>();
export const RuntimeVersionSchema = exactNonBlankString('Runtime version').brand<'RuntimeVersion'>();
```

Define `RepositoryRelativePathSchema` from the same exact string and reject when any condition is true:

```ts
value.includes('\\') ||
value.includes('\0') ||
value.startsWith('/') ||
/^[A-Za-z]:\//.test(value) ||
value.endsWith('/') ||
value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
```

Export every inferred branded type.

- [ ] **Step 5: Implement and export Repository**

Create `repository.ts`:

```ts
import { z } from 'zod';
import { EntityIdSchema } from './ids.js';
import { RepositoryRootPathSchema } from './source-identity.js';

export const RepositorySchema = z.strictObject({
  id: EntityIdSchema,
  rootPath: RepositoryRootPathSchema,
});
export type Repository = z.infer<typeof RepositorySchema>;
```

Export all Task 1 public schemas/types from `index.ts`. Add `packages/ir/test/source-revision-ir.test.mjs` to the root `test` script immediately after `common-ir.test.mjs`.

- [ ] **Step 6: Run GREEN and regression gates**

Run:

```powershell
pnpm --filter @codeatlas/ir build
node --test --test-name-pattern="repository|source identity|relative path" packages/ir/test/source-revision-ir.test.mjs
pnpm --filter @codeatlas/ir test:types
pnpm test
pnpm architecture:check
git diff --check
```

Expected: all commands exit zero; the existing Common IR and root tests remain green.

- [ ] **Step 7: Commit Task 1**

```powershell
git add package.json packages/ir/src/index.ts packages/ir/src/source-identity.ts packages/ir/src/repository.ts packages/ir/test/source-revision-ir.test.mjs packages/ir/type-test/source-revision-brands.test.ts fixtures/ir/source-revision-v1
git commit -m "feat: add source identity and repository IR"
```

### Task 2: Revision variants and transition semantics

**Files:**

- Create: `packages/ir/src/revision.ts`
- Modify: `packages/ir/src/index.ts`
- Modify: `packages/ir/test/source-revision-ir.test.mjs`
- Modify: `fixtures/ir/source-revision-v1/valid/cases.json`
- Modify: `fixtures/ir/source-revision-v1/invalid/cases.json`

**Interfaces:**

- Consumes: `EntityIdSchema`, `ContentFingerprintSchema`, `CommitIdentitySchema`, `parseIr`, `IrValidationError`.
- Produces: `RevisionKindSchema`, `CommitRevisionSchema`, `WorktreeRevisionSchema`, `SnapshotRevisionSchema`, `RevisionSchema`, inferred types, and `validateRevisionTransition(previous: unknown, next: unknown): Revision`.

- [ ] **Step 1: Add Revision and transition cases before production code**

Add valid JSON cases for one COMMIT, one WORKTREE with `baseRevisionId: null`, one SNAPSHOT with `sourceRevisionId`, and an idempotent immutable transition. Add a valid transition target containing the same WORKTREE ID/repository/kind with changed fingerprint and base revision.

Add invalid JSON cases for missing variant fields, cross-kind unknown fields, and transitions changing WORKTREE ID, repository, or kind. Add immutable transition cases changing COMMIT fingerprint, COMMIT identity, SNAPSHOT fingerprint, and SNAPSHOT source revision. Each relationship error declares the exact path under `next`.

Extend the runner map with `REVISION` and `REVISION_TRANSITION`; the latter calls:

```js
ir.validateRevisionTransition(input.previous, input.next)
```

- [ ] **Step 2: Run the focused Revision RED check**

Run:

```powershell
pnpm --filter @codeatlas/ir build
node --test --test-name-pattern="revision|worktree|commit|snapshot" packages/ir/test/source-revision-ir.test.mjs
```

Expected: new cases fail because Revision schemas and transition validation are absent. Confirm existing Repository cases still pass.

- [ ] **Step 3: Implement the strict discriminated union**

Create schemas with these exact fields:

```ts
const RevisionBaseShape = {
  id: EntityIdSchema,
  repositoryId: EntityIdSchema,
  contentFingerprint: ContentFingerprintSchema,
};

export const CommitRevisionSchema = z.strictObject({
  ...RevisionBaseShape,
  kind: z.literal('COMMIT'),
  commitIdentity: CommitIdentitySchema,
});
export const WorktreeRevisionSchema = z.strictObject({
  ...RevisionBaseShape,
  kind: z.literal('WORKTREE'),
  baseRevisionId: EntityIdSchema.nullable(),
});
export const SnapshotRevisionSchema = z.strictObject({
  ...RevisionBaseShape,
  kind: z.literal('SNAPSHOT'),
  sourceRevisionId: EntityIdSchema.nullable(),
});
export const RevisionSchema = z.discriminatedUnion('kind', [
  CommitRevisionSchema,
  WorktreeRevisionSchema,
  SnapshotRevisionSchema,
]);
```

Export `RevisionKindSchema = z.enum(['COMMIT', 'WORKTREE', 'SNAPSHOT'])` and inferred types.

- [ ] **Step 4: Implement deterministic transition validation**

Parse both arguments with `RevisionSchema`. Compare in this exact order: `repositoryId`, `id`, `kind`. On mismatch throw one `IrValidationError` whose path is respectively `['next', 'repositoryId']`, `['next', 'id']`, or `['next', 'kind']`.

For `WORKTREE`, return `next` after the identity checks. For `COMMIT`, reject changed `commitIdentity` then changed `contentFingerprint`. For `SNAPSHOT`, reject changed `sourceRevisionId` then changed `contentFingerprint`. Use the corresponding `['next', field]` path and fixed messages below 128 characters. Identical immutable values return `next`.

- [ ] **Step 5: Export and run GREEN gates**

Export every Revision schema, type, and validator from `index.ts`, then run:

```powershell
pnpm --filter @codeatlas/ir build
node --test --test-name-pattern="revision|worktree|commit|snapshot" packages/ir/test/source-revision-ir.test.mjs
node --test packages/ir/test/common-ir.test.mjs packages/ir/test/source-revision-ir.test.mjs
pnpm --filter @codeatlas/ir test:types
pnpm architecture:check
git diff --check
```

Expected: all commands exit zero; the transition cases prove mutable and immutable behavior without storage.

- [ ] **Step 6: Commit Task 2**

```powershell
git add packages/ir/src/revision.ts packages/ir/src/index.ts packages/ir/test/source-revision-ir.test.mjs fixtures/ir/source-revision-v1
git commit -m "feat: add revision identity semantics"
```

### Task 3: SourceFile schema and orthogonal classification

**Files:**

- Create: `packages/ir/src/source-file.ts`
- Modify: `packages/ir/src/index.ts`
- Modify: `packages/ir/test/source-revision-ir.test.mjs`
- Modify: `packages/ir/type-test/source-revision-brands.test.ts`
- Modify: `fixtures/ir/source-revision-v1/valid/cases.json`
- Modify: `fixtures/ir/source-revision-v1/invalid/cases.json`

**Interfaces:**

- Consumes: `EntityIdSchema`, `RepositoryRelativePathSchema`, and `ContentFingerprintSchema`.
- Produces: `SourceFileRoleSchema`, `SourceFileProvenanceSchema`, `SourceContentKindSchema`, `SourceFileClassificationSchema`, `SourceSensitivitySchema`, `LanguageHintSchema`, `SourceFileSchema`, and their inferred types.

- [ ] **Step 1: Add SourceFile Fixture cases**

Add valid `SOURCE_FILE` cases covering these exact classification combinations and identity behavior:

```json
[
  {
    "id": "source-file-authored-source",
    "target": "SOURCE_FILE",
    "input": {
      "id": "entity:file-src-main",
      "repositoryId": "entity:repo-01",
      "revisionId": "entity:revision-worktree",
      "path": "src/main.ts",
      "contentFingerprint": "sha256:file-main-v1",
      "classification": { "role": "SOURCE", "provenance": "AUTHORED", "contentKind": "TEXT" },
      "languageHint": "typescript",
      "sensitivity": "INTERNAL"
    }
  },
  {
    "id": "source-file-generated-test",
    "target": "SOURCE_FILE",
    "input": {
      "id": "entity:file-generated-test",
      "repositoryId": "entity:repo-01",
      "revisionId": "entity:revision-worktree",
      "path": "generated/client.test.ts",
      "contentFingerprint": "sha256:generated-test-v1",
      "classification": { "role": "TEST", "provenance": "GENERATED", "contentKind": "TEXT" },
      "languageHint": "typescript",
      "sensitivity": "PUBLIC"
    }
  },
  {
    "id": "source-file-vendor-binary",
    "target": "SOURCE_FILE",
    "input": {
      "id": "entity:file-vendor-binary",
      "repositoryId": "entity:repo-01",
      "revisionId": "entity:revision-snapshot",
      "path": "vendor/data.bin",
      "contentFingerprint": "sha256:vendor-binary-v1",
      "classification": { "role": "OTHER", "provenance": "VENDOR", "contentKind": "BINARY" },
      "languageHint": null,
      "sensitivity": "SENSITIVE"
    }
  }
]
```

Add a fourth valid case using `SECRET`. Add two cases with the same SourceFile ID and path at different revision IDs/fingerprints and assert in the runner that their parsed IDs remain equal while revisions/fingerprints differ.

Add invalid cases for each unknown enum value, blank/padded language hint, invalid relative path, missing `languageHint`, and unknown SourceFile/classification keys. Add a programmatic test passing `languageHint: undefined` and expect `IR_VALIDATION_FAILED` at `['languageHint']`.

- [ ] **Step 2: Run focused SourceFile RED**

Run:

```powershell
pnpm --filter @codeatlas/ir build
node --test --test-name-pattern="source file|classification|sensitivity|language hint" packages/ir/test/source-revision-ir.test.mjs
pnpm --filter @codeatlas/ir test:types
```

Expected: new runtime checks and SourceFile type imports fail because the exports do not exist. Existing Repository and Revision cases remain green.

- [ ] **Step 3: Implement SourceFile schemas**

Create `source-file.ts` with exact enums and required nullable language hint:

```ts
export const SourceFileRoleSchema = z.enum(['SOURCE', 'TEST', 'OTHER']);
export const SourceFileProvenanceSchema = z.enum(['AUTHORED', 'GENERATED', 'VENDOR']);
export const SourceContentKindSchema = z.enum(['TEXT', 'BINARY']);
export const SourceSensitivitySchema = z.enum(['PUBLIC', 'INTERNAL', 'SENSITIVE', 'SECRET']);

export const SourceFileClassificationSchema = z.strictObject({
  role: SourceFileRoleSchema,
  provenance: SourceFileProvenanceSchema,
  contentKind: SourceContentKindSchema,
});

export const LanguageHintSchema = z.string().refine(
  (value) => value.length > 0 && value.trim().length > 0 && value === value.trim(),
  { message: 'Language hint must be exact and non-blank' },
);

export const SourceFileSchema = z.strictObject({
  id: EntityIdSchema,
  repositoryId: EntityIdSchema,
  revisionId: EntityIdSchema,
  path: RepositoryRelativePathSchema,
  contentFingerprint: ContentFingerprintSchema,
  classification: SourceFileClassificationSchema,
  languageHint: LanguageHintSchema.nullable(),
  sensitivity: SourceSensitivitySchema,
});
```

Infer and export every public type. Do not add path normalization, classifier logic, filesystem access, or rename detection.

- [ ] **Step 4: Export and run SourceFile GREEN gates**

Extend the runner with `SOURCE_FILE`, export the schemas/types from `index.ts`, and extend the type test with a function accepting `RepositoryRelativePath` that rejects ContentFingerprint and EntityId under `@ts-expect-error`.

Run:

```powershell
pnpm --filter @codeatlas/ir build
node --test --test-name-pattern="source file|classification|sensitivity|language hint" packages/ir/test/source-revision-ir.test.mjs
node --test packages/ir/test/common-ir.test.mjs packages/ir/test/source-revision-ir.test.mjs
pnpm --filter @codeatlas/ir test:types
pnpm architecture:check
git diff --check
```

Expected: all commands exit zero, including the logical-file identity assertion.

- [ ] **Step 5: Commit Task 3**

```powershell
git add packages/ir/src/source-file.ts packages/ir/src/index.ts packages/ir/test/source-revision-ir.test.mjs packages/ir/type-test/source-revision-brands.test.ts fixtures/ir/source-revision-v1
git commit -m "feat: add source file IR"
```

### Task 4: ProviderSnapshot and requested-revision matching

**Files:**

- Create: `packages/ir/src/provider-snapshot.ts`
- Modify: `packages/ir/src/index.ts`
- Modify: `packages/ir/test/source-revision-ir.test.mjs`
- Modify: `packages/ir/type-test/source-revision-brands.test.ts`
- Modify: `fixtures/ir/source-revision-v1/valid/cases.json`
- Modify: `fixtures/ir/source-revision-v1/invalid/cases.json`

**Interfaces:**

- Consumes: `EntityIdSchema`, `ProviderIdSchema`, `ProviderVersionSchema`, `RuntimeVersionSchema`, `ContentFingerprintSchema`, `UtcInstantSchema`, `SourceRangeSchema`, `RevisionSchema`, `parseIr`, and `IrValidationError`.
- Produces: `ProviderCapabilitySupportSchema`, `ProviderCoverageStatusSchema`, `ProviderCapabilityObservationSchema`, `ProviderDiagnosticSeveritySchema`, `ProviderSnapshotDiagnosticSchema`, `ProviderSnapshotOutcomeSchema`, `ProviderSnapshotSchema`, inferred types, and `validateProviderSnapshotRevision(snapshot: unknown, revision: unknown): ProviderSnapshot`.

- [ ] **Step 1: Add ProviderSnapshot and relationship cases**

Add valid `PROVIDER_SNAPSHOT` cases for `SUCCEEDED`, `PARTIAL`, `FAILED`, and `CANCELLED`. Across those cases exercise both support values, all four coverage values, all diagnostic severities, a null source range, and a valid SourceRange. Use canonical UTC millisecond timestamps.

Add valid `PROVIDER_SNAPSHOT_REVISION` cases matching a COMMIT and matching two observed states of the same WORKTREE ID with the corresponding requested fingerprint.

Add invalid JSON cases for duplicate capability names, unknown support/coverage/outcome/severity, blank/padded Provider ID or version, blank/padded/over-128 diagnostic messages, completion before start, and unknown keys. Add matching failures for repository ID, requested revision ID, and requested fingerprint, with paths `['snapshot', 'repositoryId']`, `['snapshot', 'requestedRevisionId']`, and `['snapshot', 'requestedRevisionFingerprint']`.

Extend the runner map:

```js
PROVIDER_SNAPSHOT: (input) => ir.parseIr(ir.ProviderSnapshotSchema, input),
PROVIDER_SNAPSHOT_REVISION: (input) =>
  ir.validateProviderSnapshotRevision(input.snapshot, input.revision),
```

- [ ] **Step 2: Run focused ProviderSnapshot RED**

Run:

```powershell
pnpm --filter @codeatlas/ir build
node --test --test-name-pattern="provider snapshot|capability|coverage|diagnostic|requested revision" packages/ir/test/source-revision-ir.test.mjs
pnpm --filter @codeatlas/ir test:types
```

Expected: new tests fail because ProviderSnapshot exports are absent. Existing SourceFile/Revision/Repository cases remain green.

- [ ] **Step 3: Implement ProviderSnapshot component schemas**

Create exact schemas:

```ts
export const ProviderCapabilitySupportSchema = z.enum(['SUPPORTED', 'UNSUPPORTED']);
export const ProviderCoverageStatusSchema = z.enum(['COMPLETE', 'PARTIAL', 'NONE', 'UNKNOWN']);
export const ProviderDiagnosticSeveritySchema = z.enum(['INFO', 'WARNING', 'ERROR']);
export const ProviderSnapshotOutcomeSchema = z.enum(['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED']);

const ExactDiagnosticStringSchema = z.string().refine(
  (value) => value.length > 0 && value.trim().length > 0 && value === value.trim(),
  { message: 'Diagnostic text must be exact and non-blank' },
);

export const ProviderCapabilityObservationSchema = z.strictObject({
  name: ExactDiagnosticStringSchema,
  support: ProviderCapabilitySupportSchema,
  coverage: ProviderCoverageStatusSchema,
});

export const ProviderSnapshotDiagnosticSchema = z.strictObject({
  code: ExactDiagnosticStringSchema,
  severity: ProviderDiagnosticSeveritySchema,
  message: ExactDiagnosticStringSchema.max(128),
  sourceRange: SourceRangeSchema.nullable(),
});
```

Use separate local exact-string schema names for capability/diagnostic semantics if clearer, but retain the same exact/non-blank behavior and the 128-character message bound.

- [ ] **Step 4: Implement ProviderSnapshot invariants**

Define the strict object with the exact fields from the design. In `superRefine`:

1. reject `completedAt < startedAt` at `['completedAt']`;
2. track capability names in a `Map<string, number>`;
3. reject every duplicate after its first occurrence at `['capabilities', duplicateIndex, 'name']`.

Do not sort, deduplicate, infer outcome, or infer coverage.

- [ ] **Step 5: Implement requested-revision matching**

Parse snapshot and revision first. Compare in this exact order:

```ts
snapshot.repositoryId === revision.repositoryId
snapshot.requestedRevisionId === revision.id
snapshot.requestedRevisionFingerprint === revision.contentFingerprint
```

Throw one `IrValidationError` with the declared `['snapshot', field]` path and a fixed message under 128 characters on the first mismatch. Return the validated snapshot on success. Do not write state or call a Provider.

- [ ] **Step 6: Export and run ProviderSnapshot GREEN gates**

Export every schema, type, and validator. Extend type tests so a function accepting ProviderId rejects EntityId and CanonicalId, and a function accepting ContentFingerprint rejects ProviderId.

Run:

```powershell
pnpm --filter @codeatlas/ir build
node --test --test-name-pattern="provider snapshot|capability|coverage|diagnostic|requested revision" packages/ir/test/source-revision-ir.test.mjs
node --test packages/ir/test/common-ir.test.mjs packages/ir/test/source-revision-ir.test.mjs
pnpm --filter @codeatlas/ir test:types
pnpm test
pnpm architecture:check
git diff --check
```

Expected: every new and existing case passes; architecture remains 17 projects with no `ir` upper dependency.

- [ ] **Step 7: Commit Task 4**

```powershell
git add packages/ir/src/provider-snapshot.ts packages/ir/src/index.ts packages/ir/test/source-revision-ir.test.mjs packages/ir/type-test/source-revision-brands.test.ts fixtures/ir/source-revision-v1
git commit -m "feat: add provider snapshot IR"
```

### Task 5: Synchronize Canonical IR documentation and traceability

**Files:**

- Modify: `docs/handoff/specs/CANONICAL_IR.md`
- Modify: `docs/handoff/DESIGN_TRACEABILITY.md`

**Interfaces:**

- Consumes: the implemented public exports, Fixture `p0-source-revision-ir-v1`, ADR-002, and the approved design specification.
- Produces: the authoritative field-level Source/Revision IR contract and a traceable P0-W1-002 mapping. No ADR is expected because this is a compatible elaboration of ADR-002 rather than a frozen-decision change.

- [ ] **Step 1: Audit implementation against the approved design before editing authority documents**

Run:

```powershell
git diff --name-only 26733eb..HEAD
rg -n "Workspace|RevisionSet|SystemFlow|Provider SPI|Fact Merge|SQLite|Embedding|Knowledge|LLM" packages/ir fixtures/ir/source-revision-v1
```

Inspect every match. Expected: changed files stay inside the approved Source IR, Fixture, test, type-test, and package registration scope; no Deferred type, runtime dependency, persistence path, or retired formal flow name has entered production code. Test text may name forbidden concepts only when explicitly proving their absence.

- [ ] **Step 2: Document the exact Source/Revision IR contract**

Update `CANONICAL_IR.md` with:

- all branded scalar meanings and exact-string behavior;
- Repository identity versus relocatable `rootPath`;
- the strict COMMIT / WORKTREE / SNAPSHOT discriminated union and transition rules;
- SourceFile logical path identity, orthogonal classification, nullable language hint, and sensitivity;
- ProviderSnapshot observation fields, opaque provider metadata, capability/coverage vocabulary, bounded diagnostics, time/uniqueness rules, and requested-revision matching;
- explicit statements that ProviderSnapshot does not activate Canonical State and that rename remains delete plus add in Phase 0.5;
- the provider-independent, SQLite-authoritative, candidate/evidence, and Deferred boundaries that remain unchanged.

Use names and field types exactly as exported. Do not document discovery, hash computation, persistence, Provider execution, Fact Merge, or any later-phase behavior as implemented.

- [ ] **Step 3: Update design traceability**

Update the existing `P0-W1-002` row in `DESIGN_TRACEABILITY.md` so it records, without creating a duplicate task row:

```text
Task: P0-W1-002
Spec: docs/handoff/specs/CANONICAL_IR.md
Fixture: p0-source-revision-ir-v1
Acceptance: Mutable and immutable revision semantics differ
```

Reference ADR-002 and the actual test/Fixture paths. Preserve the task's current governance state until final evidence is recorded in `CURRENT_STATUS.md`.

- [ ] **Step 4: Verify documentation consistency and full local gates**

Run:

```powershell
pnpm exec prettier --check docs/handoff/specs/CANONICAL_IR.md docs/handoff/DESIGN_TRACEABILITY.md docs/superpowers/specs/2026-09-14-p0-w1-002-source-revision-ir-design.md
pnpm --filter @codeatlas/ir build
node --test packages/ir/test/common-ir.test.mjs packages/ir/test/source-revision-ir.test.mjs
pnpm --filter @codeatlas/ir test:types
pnpm test
pnpm architecture:check
git diff --check
git status --short
```

Expected: all checks exit zero; only approved task files and these authority documents are changed. Record actual counts from command output for Task 6 rather than copying predicted counts.

- [ ] **Step 5: Commit Task 5**

```powershell
git add docs/handoff/specs/CANONICAL_IR.md docs/handoff/DESIGN_TRACEABILITY.md
git commit -m "docs: specify source and revision IR"
```

### Task 6: Final Quality Gate, reproducible status evidence, and feature-branch CI

**Files:**

- Modify: `docs/handoff/CURRENT_STATUS.md`

**Interfaces:**

- Consumes: completed Tasks 1-5, Fixture `p0-source-revision-ir-v1`, all repository verification scripts, and hosted CI results.
- Produces: fresh local and hosted evidence for P0-W1-002 on `codex/p0-w1-002-source-revision-ir`. It does not merge `main` or create a pull request.

- [ ] **Step 1: Run the declared local completion gate from a clean build state**

Run:

```powershell
pnpm verify
git diff --check
git status --short
```

Expected: the full Node, Fixture, type, formatting, architecture, Rust format/build/Clippy, and smoke-test chain exits zero. Capture the exact test counts, architecture project count, Rust test count, date, branch, and HEAD. If any check fails, diagnose whether implementation, Fixture, or design is wrong; do not weaken the check or alter authority data merely to pass.

- [ ] **Step 2: Perform explicit Guardrail and Deferred-scope audits**

Run focused searches and inspect all results:

```powershell
rg -n "@codeatlas/" packages/ir/src packages/ir/test packages/ir/type-test
rg -n "sqlite|database|embedding|zvec|llm|knowledge|evidence|claim|ExecutionGraph|RuntimeFlow|BusinessFlow|SystemFlow|RevisionSet|watcher|daemon|network|fetch\(" packages/ir/src packages/ir/test packages/ir/type-test fixtures/ir/source-revision-v1
rg -n "providerId.*(?:EntityId|CanonicalId)|(?:EntityId|CanonicalId).*providerId" packages/ir/src packages/ir/type-test
```

Confirm with evidence that `@codeatlas/ir` remains dependency-bottom, no Provider ID is used as Canonical identity, no database/application boundary is bypassed, no retired formal flow name is restored, and no Deferred capability is implemented. Search matches in prose-like test names are acceptable only after manual inspection.

- [ ] **Step 3: Record fresh local evidence in CURRENT_STATUS**

Update `CURRENT_STATUS.md` with:

- task `P0-W1-002`, branch and exact local HEAD;
- implemented contracts and pure validation helpers;
- governing ADR/spec and the approved implementation-design document;
- Fixture `p0-source-revision-ir-v1` and exact valid/invalid case totals;
- unit/type/Fixture/Quality Gate/architecture/Rust results using actual output counts;
- failure/recovery evidence (RED checks and invalid/relationship cases) and confirmation that no storage exists in this task, so previous Canonical Graph/Published Knowledge preservation is not exercised;
- explicit Guardrail and Deferred-scope audit results;
- documentation and traceability synchronization;
- statement that no frozen design changed and no new ADR or migration was required;
- next task according to the authoritative work breakdown, without marking unimplemented work complete.

Do not add a hosted-CI success claim before the run exists.

- [ ] **Step 4: Commit local evidence and verify the evidence commit**

```powershell
git add docs/handoff/CURRENT_STATUS.md
git commit -m "docs: record source revision IR evidence"
pnpm verify
git status --short
```

Expected: verification exits zero and the worktree is clean. If the evidence commit changes the recorded HEAD, describe the evidence as applying to the named tree/commit chain without inventing a self-referential final commit hash.

- [ ] **Step 5: Push only the feature branch and wait for hosted CI**

```powershell
git push -u origin codex/p0-w1-002-source-revision-ir
```

Wait for the exact GitHub Actions run triggered by the pushed feature-branch HEAD. Verify its workflow name, conclusion, URL, branch, and commit SHA. Do not merge `main`, force-push, change repository visibility, lower a Gate, or create a pull request.

- [ ] **Step 6: Close the status record with hosted evidence**

Add the actual hosted CI workflow name, URL, conclusion, tested commit SHA, and completion time to `CURRENT_STATUS.md`. Commit and push:

```powershell
git add docs/handoff/CURRENT_STATUS.md
git commit -m "docs: close source revision IR task"
git push origin codex/p0-w1-002-source-revision-ir
```

Wait for and verify the CI run for this final documentation-only HEAD. Record this second run in a way that does not require another status commit: the final handoff may cite its URL and SHA while `CURRENT_STATUS.md` already identifies the implementation/evidence run and explains the final documentation-only delta.

- [ ] **Step 7: Final reproducibility and repository-state check**

Run:

```powershell
pnpm verify
git diff --check
git status --short
git rev-parse HEAD
git rev-parse '@{upstream}'
```

Expected: all local gates exit zero, the worktree is clean, local HEAD equals upstream, and the final hosted run for that HEAD succeeds. Report exact evidence; do not claim P0-W1-002 complete if any required result is missing.
