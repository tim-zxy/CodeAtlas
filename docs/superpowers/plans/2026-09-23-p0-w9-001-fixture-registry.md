# P0-W9-001 Fixture Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover and validate versioned evaluation Fixture manifests with deterministic results and actionable path errors.

**Architecture:** `@codeatlas/evaluation` parses a strict JSON manifest independently of filesystem access, then a registry walks an explicit root and resolves declared artifacts without escaping either the root or Fixture directory. Existing `cases.json` indexes remain untouched. Comparison and metric calculation are excluded.

**Tech Stack:** Node.js 24, TypeScript 7, Node test runner, standard-library filesystem/path APIs, pnpm 11. No new runtime dependency.

**Spec:** [2026-09-23-p0-w9-001-fixture-registry-design.md](../specs/2026-09-23-p0-w9-001-fixture-registry-design.md)

## Global Constraints

- Recognize only `fixture.json`; recursively discover under a caller-supplied root and ignore `cases.json`.
- Version 1 requires all declared fields, rejects unknown fields, and accepts only phases `0`, `0.5`, `1`, `2`, `3` and the four Evaluation categories.
- Paths are `/`-separated, relative, existing files or directories inside the Fixture directory; reject traversal, absolute/drive/UNC paths, backslashes, and symlink escape.
- Do not load or compare facts, calculate metrics, regenerate baselines, or publish canonical knowledge.
- Before code changes, read the repository's `AGENTS.md` authority documents in order and confirm P0-W4-001 integration; preserve the Phase 0 architecture boundaries.

## Review Focus

- A `cases.json` beside a valid manifest must not be parsed as a registry manifest; Task 2 tests this.
- Two manifests with the same ID in different directories must fail with both paths; Task 2 tests this.
- A symlinked artifact that lexically looks safe but resolves outside its Fixture directory must fail; Task 2 tests this, skipping only when symlink creation is unavailable.
- A directory symlink cycle must terminate without duplicate discovery; Task 2 tests this, skipping only when symlink creation is unavailable.
- A malformed manifest after an earlier valid one must fail the entire discovery call, not return a partial registry; Task 2 tests this.

---

## File map

- `packages/evaluation/src/fixture-manifest.ts`: exported v1 type and pure schema parser; no I/O.
- `packages/evaluation/src/fixture-registry.ts`: recursive discovery, artifact resolution, ordering, duplicate-ID check.
- `packages/evaluation/src/fixture-error.ts`: typed error carrying code, manifest path, and field path.
- `packages/evaluation/src/index.ts`: public exports for those contracts.
- `packages/evaluation/test/fixture-manifest.test.mjs`: table-driven valid/invalid schema tests.
- `packages/evaluation/test/fixture-registry.test.mjs`: filesystem and path-safety tests with temporary roots.
- `fixtures/evaluation/registry-v1/fixture.json` plus `source/example.ts` and `expected/nodes.json`: one valid, non-evaluated registry Fixture used by tests; invalid examples live only in temporary test roots so a normal recursive scan cannot pick them up.
- `package.json`, `scripts/test-workspace-structure.mjs`: wire the two suites into root tests and adjust the shell-source assertion for the evaluation package.
- `docs/handoff/specs/EVALUATION.md`, `docs/handoff/CURRENT_STATUS.md`, `docs/handoff/DESIGN_TRACEABILITY.md`: make the JSON filename normative and record fresh implementation evidence and traceability.

### Task 1: Pure v1 manifest contract

**Files:** Create `packages/evaluation/src/fixture-error.ts`, `packages/evaluation/src/fixture-manifest.ts`, `packages/evaluation/test/fixture-manifest.test.mjs`; modify `packages/evaluation/src/index.ts`.

**Interfaces:** Produce `parseFixtureManifest(value: unknown, manifestPath: string): FixtureManifestV1` and `FixtureRegistryError` with `code`, `manifestPath`, and `fieldPath`. Task 2 imports both. The parser validates declaration shape only; it does not inspect paths on disk.

```ts
export class FixtureRegistryError extends Error {
  constructor(
    readonly code: 'ROOT_INVALID' | 'MANIFEST_INVALID' | 'ARTIFACT_INVALID' | 'DUPLICATE_ID',
    readonly manifestPath: string,
    readonly fieldPath: string,
    reason: string,
    options?: { cause?: unknown },
  ) {
    super(`${manifestPath}${fieldPath ? `: ${fieldPath}` : ''}: ${reason}`, options);
    this.name = 'FixtureRegistryError';
  }
}
```

- [ ] **Step 1: Write the failing contract tests.** Use `node:test` and import `../dist/index.js`. Define a valid object with every required field, then table-test omission/unknown fields at each object level, unsupported version, illegal category/phase/operator/threshold, blank/duplicate strings, duplicate critical-fact IDs, empty artifact maps, and unsafe lexical artifact paths. Assert `error instanceof FixtureRegistryError`, its `manifestPath`, and exact `fieldPath` (for example `expected.nodes`). Representative test:

```js
test('unsupported schema version names the field', () => {
  assert.throws(() => parseFixtureManifest({ ...valid, schemaVersion: 2 }, 'a/fixture.json'), (error) => {
    assert.ok(error instanceof FixtureRegistryError);
    assert.equal(error.manifestPath, 'a/fixture.json');
    assert.equal(error.fieldPath, 'schemaVersion');
    return true;
  });
});
```

- [ ] **Step 2: Run red.** `pnpm --filter @codeatlas/evaluation build && node --test packages/evaluation/test/fixture-manifest.test.mjs`. Expected: the new test fails because the parser is not exported.
- [ ] **Step 3: Implement the typed error and parser.** Use standard-library checks and explicit exact-key validation; no coercion or defaults. Define `FixtureManifestV1` with `schemaVersion: 1`, the four category literals, five phase literals, readonly string arrays, readonly artifact maps, critical-fact objects, and quality-gate objects. Throw at the first invalid field in fixed field order. For example:

```ts
function fail(path: string, field: string, reason: string): never {
  throw new FixtureRegistryError('MANIFEST_INVALID', path, field, reason);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string, field: string): void {
  for (const key of keys) if (!(key in value)) fail(path, field ? `${field}.${key}` : key, 'required field is missing');
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(path, field ? `${field}.${key}` : key, 'unknown field');
}

function safeArtifactPath(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  const parts = value.endsWith('/') ? value.slice(0, -1).split('/') : value.split('/');
  return parts.every((part) => part !== '' && part !== '.' && part !== '..');
}
```

  Handle UNC paths (which begin with backslashes) through the backslash rejection. Reject whitespace-only identifiers and values with leading/trailing whitespace. Return a fresh typed object, not the caller's mutable input.
- [ ] **Step 4: Run green.** Run the Task 1 command again; require every schema case to pass. Run `pnpm architecture:check` to confirm the package remains dependency-free.
- [ ] **Step 5: Commit the self-contained contract.** Stage only Task 1 files and commit `feat(evaluation): validate fixture manifest v1`.

### Task 2: Deterministic discovery and safe artifact resolution

**Files:** Create `packages/evaluation/src/fixture-registry.ts`, `packages/evaluation/test/fixture-registry.test.mjs`, `fixtures/evaluation/registry-v1/fixture.json`, `fixtures/evaluation/registry-v1/source/example.ts`, `fixtures/evaluation/registry-v1/expected/nodes.json`; modify `packages/evaluation/src/index.ts`.

**Interfaces:** Consume Task 1's parser and error. Produce `discoverFixtures(root: string): Promise<readonly RegisteredFixture[]>`. Each `RegisteredFixture` contains `manifest: FixtureManifestV1`, root-relative POSIX `manifestPath`, absolute `directory`, and absolute `inputs`/`expected` path maps. No artifact contents are loaded.

- [ ] **Step 1: Write failing discovery tests.** Use `mkdtemp` under `node:os.tmpdir()`, `mkdir`, `writeFile`, `symlink`, and `rm` in test cleanup; create manifests with the Task 1 shape. Test nested discovery and lexical ordering, empty root, a `cases.json` ignored beside a valid manifest, absent/unreadable root, malformed JSON after a valid manifest, duplicate IDs with both paths, missing file, directory artifact, traversal/absolute path rejection, artifact symlink escape, and directory symlink cycle. For platform-dependent symlink creation, skip only that individual case on `EPERM`/`EACCES`; do not skip the other path tests. Representative tests:

```js
const valid = {
  schemaVersion: 1, id: 'base', category: 'code-intelligence', phase: '0',
  languages: [], frameworks: [], capabilities: [],
  inputs: { source: 'source/' }, expected: { nodes: 'expected/nodes.json' },
  criticalFacts: [], qualityGates: {},
};

async function writeFixture(root, folder, manifest) {
  const directory = join(root, folder);
  await mkdir(join(directory, 'source'), { recursive: true });
  await mkdir(join(directory, 'expected'), { recursive: true });
  await writeFile(join(directory, 'expected', 'nodes.json'), '[]', 'utf8');
  await writeFile(join(directory, 'fixture.json'), JSON.stringify(manifest), 'utf8');
}

test('ignores cases.json and orders nested manifests', async (t) => {
  const root = await temporaryFixtureRoot(t);
  await writeFixture(root, 'z', { ...valid, id: 'z' });
  await writeFixture(root, 'a/nested', { ...valid, id: 'a' });
  await writeFile(join(root, 'a', 'nested', 'cases.json'), '{ bad json', 'utf8');
  const found = await discoverFixtures(root);
  assert.deepEqual(found.map((entry) => entry.manifest.id), ['a', 'z']);
});
```

  The test helper `writeFixture` creates the declared `source/` and `expected/nodes.json` before writing `fixture.json`; `temporaryFixtureRoot` registers cleanup with `t.after`. Test the committed valid Fixture by calling `discoverFixtures` on `fixtures/evaluation` and asserting its ID.
- [ ] **Step 2: Run red.** `pnpm --filter @codeatlas/evaluation build && node --test packages/evaluation/test/fixture-registry.test.mjs`. Expected: missing `discoverFixtures` export causes failure.
- [ ] **Step 3: Implement discovery.** Resolve and `realpath` the root; walk directory entries in sorted name order, do not descend into directory symlinks, and collect only exact `fixture.json` filenames. Parse each in sorted root-relative POSIX order. Resolve each declared artifact with `realpath`, then ensure its target is inside the Fixture directory using `relative(fixtureRealPath, targetRealPath)` and rejecting `..` prefixes or absolute relative results. `stat` each target to require a file or directory. Use a `Map` for IDs and fail duplicates with both paths. Representative boundary check:

```ts
function isInside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
```

  Convert I/O and JSON parse failures to `FixtureRegistryError` with the manifest and field path; preserve the underlying cause. Fail atomically, never returning earlier valid entries after a later failure. If `root` is not a directory, return a typed root error; an existing empty directory returns `[]`.
- [ ] **Step 4: Run green and filesystem regression checks.** Re-run Task 2's focused command and Task 1 tests. Confirm all path/symlink and duplicate-ID assertions pass; run `pnpm architecture:check`.
- [ ] **Step 5: Commit the registry and valid Fixture.** Stage only Task 2 files and commit `feat(evaluation): discover safe fixture manifests`.

### Task 3: Root integration, design synchronization, and acceptance evidence

**Files:** Modify `package.json`, `scripts/test-workspace-structure.mjs`, `docs/handoff/specs/EVALUATION.md`, `docs/handoff/CURRENT_STATUS.md`, and `docs/handoff/DESIGN_TRACEABILITY.md`.

**Interfaces:** No new API; root `pnpm test` runs both evaluation suites and the structure test recognizes the new public exports. The Evaluation spec identifies `fixture.json` JSON v1 as the normative manifest, while leaving task-specific `cases.json` unchanged.

- [ ] **Step 1: Pin the integration with a failing structure test.** Change `scripts/test-workspace-structure.mjs` so the evaluation-package branch asserts `fixture-manifest` and `fixture-registry` exports instead of `export {};`, and assert root `scripts.test` includes both exact evaluation test paths. Run `node --test scripts/test-workspace-structure.mjs`; expected FAIL until the root script is updated. Representative assertions:

```js
assert.match(manifest.scripts.test, /packages\/evaluation\/test\/fixture-manifest\.test\.mjs/);
assert.match(manifest.scripts.test, /packages\/evaluation\/test\/fixture-registry\.test\.mjs/);
```

- [ ] **Step 2: Wire the root test script and update the Evaluation authority.** Append both suites to the root `node --test` list in `package.json`. In `EVALUATION.md`, replace the illustrative YAML block with equivalent `fixture.json` JSON v1, including `frameworks: []`, and state that existing `cases.json` remains separate. Keep the four Evaluation layers and later comparator/report sections intact.

```json
"test": "pnpm --filter @codeatlas/ir test:types && node --test packages/ir/test/common-ir.test.mjs packages/ir/test/source-revision-ir.test.mjs packages/ir/test/code-fact-ir.test.mjs packages/ir/test/evidence-ir.test.mjs packages/providers/test/native-ipc.test.mjs packages/providers/test/native-ipc-bytes.test.mjs packages/providers/test/native-client.test.mjs packages/providers/test/provider-routing.test.mjs packages/providers/test/provider-spi.test.mjs packages/plugins/test/plugin-routing.test.mjs packages/plugins/test/plugin-spi.test.mjs scripts/test-workspace-structure.mjs scripts/test-architecture-rules.mjs packages/runtime/test/runtime-bootstrap.test.mjs scripts/test-runtime-construction.mjs apps/cli/test/smoke.test.mjs apps/mcp/test/smoke.test.mjs packages/storage/test/migration-runner.test.mjs packages/storage/test/migration-runner-application.test.mjs packages/storage/test/migration-runner-failures.test.mjs packages/storage/test/repository-schema.test.mjs packages/storage/test/repository-constraints.test.mjs packages/storage/test/workspace-schema.test.mjs packages/storage/test/workspace-revision-set.test.mjs packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs"
```
- [ ] **Step 3: Run the full acceptance commands.** Run `pnpm install --frozen-lockfile` if workspace dependencies are absent, then `pnpm verify`. Also run the focused evaluation tests and `pnpm architecture:check` separately so failures can be attributed. Do not claim completion if any command fails. Check `git diff --check` and inspect the final diff for comparator/metric or unrelated changes.
- [ ] **Step 4: Record reproducible evidence.** In `CURRENT_STATUS.md`, replace stale P0-W4-001 integration wording only after confirming `main` contains its merge; add a P0-W9-001 entry with the actual revision, Fixture ID, exact commands/results and pass counts, schema version, limitations, and P0-W9-002 as the next task. In `DESIGN_TRACEABILITY.md`, replace the generic P0-W9-001 Fixture cell with the committed registry Fixture/test paths and retain its Evaluation authority. Do not invent hosted CI evidence; add it only after a green hosted run exists.
- [ ] **Step 5: Re-run changed checks and commit.** Run `pnpm verify` after the documentation edits if formatting affects it, run `git diff --check`, then stage only Task 3 files and commit `test(evaluation): integrate fixture registry acceptance`.

## Plan self-review gate

- Check every design section against Tasks 1–3: strict schema; deterministic recursion; safe paths; actionable errors; legacy-index coexistence; valid/invalid tests; root verification; authority/status synchronization.
- Search this plan for incomplete markers and undefined interface names. Confirm Task 2 consumes Task 1's exact exported names and Task 3 consumes both suites' exact paths.
- Verify each Review Focus condition has a named test in Task 2. Do not implement P0-W9-002 or P0-W9-003 while executing this plan.
