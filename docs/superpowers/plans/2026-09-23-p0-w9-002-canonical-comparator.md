# P0-W9-002 Canonical Comparator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compare expected and actual Canonical Code IR with stable missing, extra, semantic, and resolution classifications.

**Architecture:** `@codeatlas/evaluation` validates both in-memory fact collections with the existing IR schemas, pairs nodes and edges by FactKey then unique Canonical ID, and compares paired payloads with node-reference remapping. A single public result includes unchanged pairs, changed pairs, and unmatched facts so the later metric engine need not repeat pairing.

**Tech Stack:** Node.js 24, TypeScript 7, `@codeatlas/ir`, Node test runner, pnpm 11; no additional runtime library.

**Spec:** [2026-09-23-p0-w9-002-canonical-comparator-design.md](../specs/2026-09-23-p0-w9-002-canonical-comparator-design.md)

## Global Constraints

- Follow `AGENTS.md` authority reading before any implementation edit; P0-W9-001 and Code IR are predecessors.
- Accept only existing strict `CanonicalNodeSchema` and `CanonicalEdgeSchema` values; do not alter Canonical IR or infer a target.
- Pair same-type facts by `factKey` first, then one-to-one `id` among the remainder; never pair by names, ranges, or similarity.
- Count one paired fact once even when it has several field differences or both `SEMANTIC_DIFFERENCE` and `RESOLUTION_DIFFERENCE`.
- Compare references through paired node IDs; preserve unresolved state and candidate order.
- Invalid or duplicate input fails atomically with a stable code and field path. Output must not depend on input order or locale.
- No file loading in the comparator, metrics, eval CLI, baseline regeneration, provider normalization, or persistence.

## Review Focus

- A FactKey match with different opaque IDs must remain a clean match, including edges referring to those paired nodes; Task 2 tests it.
- An ID fallback with changed FactKey must produce a semantic field difference, not a missing/extra pair; Task 2 tests it.
- A reordered unresolved candidate array must be a resolution difference, without sorting or auto-selecting a candidate; Task 2 tests it.
- A duplicate Canonical ID shared by a node and edge on one side must fail at the later input path, not produce a partial comparison; Task 1 tests it.
- Permuting both input arrays, including unmatched facts, must yield byte-identical JSON output; Task 2 tests it.

---

## File map

- `packages/evaluation/src/comparator-error.ts`: typed atomic validation error with stable code and input field path.
- `packages/evaluation/src/comparator-match.ts`: side validation, uniqueness checks, and pure FactKey/ID pairing. It neither compares payloads nor exports a package-level API.
- `packages/evaluation/src/comparator-diff.ts`: field comparison, paired-node reference equivalence, classification, and stable sorting.
- `packages/evaluation/src/canonical-comparator.ts`: public input/result types and `compareCanonicalFacts` orchestration.
- `packages/evaluation/src/index.ts`: one new public export for comparator types/function/error.
- `packages/evaluation/test/canonical-comparator.test.mjs`: focused contract, invalid-input, matching, difference, immutability, and permutation cases.
- `fixtures/evaluation/comparator-v1/{fixture.json,expected.json,actual.json}`: committed golden Fixture consumed by the focused suite and discoverable by the registry.
- `packages/evaluation/package.json`, `pnpm-lock.yaml`, `package.json`, `scripts/test-workspace-structure.mjs`: declare the existing IR workspace dependency, wire the suite into root tests, and update structural assertions. Lockfile changes only if pnpm generates them.
- `docs/handoff/specs/EVALUATION.md`, `docs/handoff/DESIGN_TRACEABILITY.md`, `docs/handoff/CURRENT_STATUS.md`: specify the comparator result, pin Fixture/test ownership, and record fresh evidence after verification.

### Task 1: Validate and pair Canonical facts

**Files:** Create `packages/evaluation/src/comparator-error.ts`, `packages/evaluation/src/comparator-match.ts`, and `packages/evaluation/test/canonical-comparator.test.mjs`; modify `packages/evaluation/package.json` and `scripts/test-workspace-structure.mjs` for the IR dependency; update `pnpm-lock.yaml` only through `pnpm install --lockfile-only` if necessary.

**Interfaces:** `validateFactSet(input: unknown, side: 'expected' | 'actual'): CanonicalFactSet` returns schema-parsed copies of node/edge arrays. `matchFacts<T extends {id: string; factKey: string}>(expected: readonly T[], actual: readonly T[]): MatchedFacts<T>` returns ordered-independent pairs `{expected,actual,basis:'FACT_KEY'|'ID'}` and unmatched lists. These are internal exports for Task 2, not package-entry exports. `CanonicalComparatorError` exposes `code: 'INPUT_INVALID' | 'DUPLICATE_ID' | 'DUPLICATE_FACT_KEY'` and `fieldPath`.

- [ ] **Step 1: Write RED tests for validation and matching.** Add `node:test` cases importing `../dist/comparator-match.js` and `../dist/comparator-error.js`. Use a valid node factory with all required fields and assert the following exact outcomes:

```js
const confidence = { score: 1, method: 'fixture', reasons: [] };
const node = (id, factKey, name = 'A') => ({
  id, factKey, repositoryId: 'repo', revisionId: 'rev', kind: 'SYMBOL',
  symbolKind: 'METHOD', name, qualifiedName: null, sourceRange: null, confidence,
});
test('FactKey wins before ID fallback', () => {
  const result = matchFacts([node('e1', 'key-a'), node('e2', 'key-b')],
    [node('e2', 'key-a'), node('a2', 'key-b')]);
  assert.deepEqual(result.pairs.map(({ expected, actual, basis }) =>
    [expected.factKey, actual.factKey, basis]),
    [['key-a', 'key-a', 'FACT_KEY'], ['key-b', 'key-b', 'FACT_KEY']]);
  assert.equal(result.missing.length, 0);
  assert.equal(result.extra.length, 0);
});
test('a node and edge cannot reuse a Canonical ID on one side', () => {
  const edge = { id: 'same', factKey: 'edge-key', repositoryId: 'repo', revisionId: 'rev',
    kind: 'CALL', source: { factType: 'NODE', id: 'same' },
    target: { state: 'RESOLVED', resolution: 'EXACT', target: { factType: 'NODE', id: 'same' } },
    sourceRange: null, confidence };
  assert.throws(() => validateFactSet({ nodes: [node('same', 'node-key')], edges: [edge] }, 'actual'),
    (error) => error instanceof CanonicalComparatorError &&
      error.code === 'DUPLICATE_ID' && error.fieldPath === 'actual.edges[0].id');
});
```

  Also test malformed IR at `expected.nodes[0].kind`, sparse `nodes`/`edges` arrays on both sides with `[0]` input paths, duplicate node FactKey at `actual.nodes[1].factKey`, duplicate edge FactKey, malformed outer collection, empty collections, and that parsed objects do not alias input objects. For error shape, define:

```ts
export class CanonicalComparatorError extends Error {
  constructor(
    readonly code: 'INPUT_INVALID' | 'DUPLICATE_ID' | 'DUPLICATE_FACT_KEY',
    readonly fieldPath: string,
    reason: string,
  ) {
    super(`${fieldPath}: ${reason}`);
    this.name = 'CanonicalComparatorError';
  }
}
```

- [ ] **Step 2: Run RED.** `pnpm --filter @codeatlas/evaluation build && node --test packages/evaluation/test/canonical-comparator.test.mjs`. Expected: tests cannot import the new modules or named functions.

- [ ] **Step 3: Implement the minimum parser, error, and matcher.** Add `"@codeatlas/ir": "workspace:*"` to evaluation's `dependencies` and set `expectedPackageDependencies.evaluation` to the same value in the structure test. `validateFactSet` checks exact outer keys `nodes`/`edges`, checks arrays, parses each item with `CanonicalNodeSchema.safeParse` or `CanonicalEdgeSchema.safeParse`, and prefixes the first schema issue path with side/array/index. Use controlled reasons rather than embedding rejected values. Check side-wide ID uniqueness and per-type FactKey uniqueness after parsing. Implement pairing with maps and consumed actual IDs; the second pass visits only unmatched expected facts.

```ts
export type PairBasis = 'FACT_KEY' | 'ID';
export interface FactPair<T> { expected: T; actual: T; basis: PairBasis }
export interface MatchedFacts<T> { pairs: FactPair<T>[]; missing: T[]; extra: T[] }
export function matchFacts<T extends { id: string; factKey: string }>(
  expected: readonly T[], actual: readonly T[],
): MatchedFacts<T> {
  const byKey = new Map(actual.map((fact) => [fact.factKey, fact]));
  const consumed = new Set<string>();
  const pairs: FactPair<T>[] = [];
  for (const fact of expected) {
    const match = byKey.get(fact.factKey);
    if (match) { pairs.push({ expected: fact, actual: match, basis: 'FACT_KEY' }); consumed.add(match.id); }
  }
  const byId = new Map(actual.filter((fact) => !consumed.has(fact.id)).map((fact) => [fact.id, fact]));
  const matchedExpected = new Set(pairs.map((pair) => pair.expected.id));
  for (const fact of expected) {
    if (matchedExpected.has(fact.id)) continue;
    const match = byId.get(fact.id);
    if (match) { pairs.push({ expected: fact, actual: match, basis: 'ID' }); consumed.add(match.id); matchedExpected.add(fact.id); }
  }
  return { pairs, missing: expected.filter((fact) => !matchedExpected.has(fact.id)),
    extra: actual.filter((fact) => !consumed.has(fact.id)) };
}
```

  Do not use the generic matcher alone as a public validator: unique identities are guaranteed by `validateFactSet` before matching.

- [ ] **Step 4: Run GREEN and architecture checks.** Re-run the Task 1 focused command, `node --test scripts/test-workspace-structure.mjs`, and `pnpm architecture:check`. Fix only Task 1 failures, then commit only Task 1 files as `feat(evaluation): validate and pair canonical facts`.

### Task 2: Classify and stably report differences

**Files:** Create `packages/evaluation/src/comparator-diff.ts` and `packages/evaluation/src/canonical-comparator.ts`; modify `packages/evaluation/src/index.ts` and extend `packages/evaluation/test/canonical-comparator.test.mjs`.

**Interfaces:** Public `compareCanonicalFacts(input: unknown): CanonicalComparison` consumes `{ expected: {nodes,edges}, actual: {nodes,edges} }` and returns `{entries: readonly ComparisonEntry[]}`. Each entry has `factType`, nullable `expected`/`actual` identities, `matchBasis`, nullable `classification: 'MISSING'|'EXTRA'`, and a `differences` array of `{kind:'SEMANTIC_DIFFERENCE'|'RESOLUTION_DIFFERENCE',path,expected?,actual?}`. `comparePairedFacts(pair, factType, nodeIdMap)` and `sortComparisonEntries(entries)` are internal Task 2 helpers. Only the package entry exports the public API and error type.

```ts
export interface FactIdentity { readonly id: string; readonly factKey: string }
export interface ComparisonDifference {
  readonly kind: 'SEMANTIC_DIFFERENCE' | 'RESOLUTION_DIFFERENCE';
  readonly path: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
}
export interface ComparisonEntry {
  readonly factType: 'NODE' | 'EDGE';
  readonly expected: FactIdentity | null;
  readonly actual: FactIdentity | null;
  readonly matchBasis: 'FACT_KEY' | 'ID' | null;
  readonly classification: 'MISSING' | 'EXTRA' | null;
  readonly differences: readonly ComparisonDifference[];
}
export interface CanonicalComparison { readonly entries: readonly ComparisonEntry[] }
export function compareCanonicalFacts(input: unknown): CanonicalComparison;
```

- [ ] **Step 1: Write RED public tests.** Extend the focused suite to assert the complete `entries` shape for unchanged FactKey matches, ID-fallback FactKey changes, a missing node and extra node, a semantic node name/confidence change, a resolved-to-unresolved target, a resolution-level change, candidate reorder, swapped node IDs with equal literal edge references, and one edge with semantic and resolution differences. Use the Task 1 factories and this edge factory:

```js
const ref = (id) => ({ factType: 'NODE', id });
const edge = (id, factKey, source, target) => ({
  id, factKey, repositoryId: 'repo', revisionId: 'rev', kind: 'CALL',
  source: ref(source), target, sourceRange: null, confidence,
});
const resolved = (id, resolution = 'EXACT') =>
  ({ state: 'RESOLVED', resolution, target: ref(id) });
test('paired node IDs normalize edge references without changing resolution', () => {
  const expected = { nodes: [node('e-a', 'a'), node('e-b', 'b')],
    edges: [edge('e-edge', 'call', 'e-a', resolved('e-b'))] };
  const actual = { nodes: [node('a-a', 'a'), node('a-b', 'b')],
    edges: [edge('a-edge', 'call', 'a-a', resolved('a-b'))] };
  assert.ok(compareCanonicalFacts({ expected, actual }).entries.every((entry) =>
    entry.classification === null && entry.differences.length === 0));
});
```

  Freeze or serialize inputs and assert no mutation. For permutation, reverse each `nodes`/`edges` array on both sides and compare `JSON.stringify` of the whole result. Test that unmatched references with distinct IDs are reported, while identical dangling IDs are equal. Ensure two classifications on one edge remain one entry.

- [ ] **Step 2: Run RED.** `pnpm --filter @codeatlas/evaluation build && node --test packages/evaluation/test/canonical-comparator.test.mjs`. Expected: `compareCanonicalFacts` is not exported.

- [ ] **Step 3: Implement comparisons and ordering.** `compareCanonicalFacts` validates expected then actual, calls `matchFacts` separately for nodes and edges, builds `Map(expectedNodeId, actualNodeId)` from node pairs and a set of paired actual node IDs, makes paired/unmatched entries, and sorts once. Compare known schema fields explicitly: omit opaque `id`; include `factKey` (different only on ID fallback), repository/revision, kind/subkind, names, range, confidence, source, and target. Use structured field paths, never compare JSON stringification of whole objects. A reference to a paired expected node compares only to its mapped actual ID; literal equality is a fallback only when neither referenced node is paired. Candidate positions remain ordered. This corrects the original OR rule after the independent-review regression proved swapped IDs can hide a reversed edge.

```ts
function sameNodeRef(expectedId: string, actualId: string,
  paired: ReadonlyMap<string, string>, pairedActualIds: ReadonlySet<string>): boolean {
  const mapped = paired.get(expectedId);
  if (mapped !== undefined) return mapped === actualId;
  return !pairedActualIds.has(actualId) && expectedId === actualId;
}
function compareTarget(expected: CanonicalTarget, actual: CanonicalTarget,
  paired: ReadonlyMap<string, string>, pairedActualIds: ReadonlySet<string>,
  add: (path: string, a: unknown, b: unknown) => void): void {
  if (expected.state !== actual.state) add('target.state', expected.state, actual.state);
  if (expected.resolution !== actual.resolution)
    add('target.resolution', expected.resolution, actual.resolution);
  if (expected.state !== actual.state) return;
  if (expected.state === 'RESOLVED' && actual.state === 'RESOLVED') {
    if (!sameNodeRef(expected.target.id, actual.target.id, paired, pairedActualIds))
      add('target.target.id', expected.target.id, actual.target.id);
  } else if (expected.state === 'UNRESOLVED' && actual.state === 'UNRESOLVED') {
    if (expected.originalHint !== actual.originalHint)
      add('target.originalHint', expected.originalHint, actual.originalHint);
    if (expected.candidates.length !== actual.candidates.length)
      add('target.candidates.length', expected.candidates.length, actual.candidates.length);
    expected.candidates.slice(0, actual.candidates.length).forEach((candidate, index) => {
      if (!sameNodeRef(candidate.id, actual.candidates[index]!.id, paired, pairedActualIds))
        add(`target.candidates[${index}].id`, candidate.id, actual.candidates[index]!.id);
    });
  }
}
```

  Implement semantic/target difference helpers without losing a simultaneous class. For known nested JSON fields (`confidence`, `sourceRange`), recursively compare object keys in sorted order and arrays by index; emit changed leaf paths such as `confidence.score` and `sourceRange.startLine`. Define `add` so it emits controlled JSON values, with absent union fields represented by omitted optional properties. Before side validation, reject malformed top-level objects or unknown keys with `INPUT_INVALID` and paths like `expected` or `actual`. Sort entries by the spec's exact tuple using ordinal `<`/`>` comparison, never `localeCompare`. Sort field differences by semantic before resolution, then path. Return fresh output objects without caller aliases.

- [ ] **Step 4: Run GREEN and commit.** Re-run the focused suite, `node --test scripts/test-workspace-structure.mjs`, and `pnpm architecture:check`. Run `git diff --check`; commit only Task 2 files as `feat(evaluation): classify canonical graph differences`.

### Task 3: Add a golden Fixture and acceptance evidence

**Files:** Create `fixtures/evaluation/comparator-v1/fixture.json`, `expected.json`, and `actual.json`; modify `packages/evaluation/test/canonical-comparator.test.mjs`, root `package.json`, `scripts/test-workspace-structure.mjs`, `docs/handoff/specs/EVALUATION.md`, `docs/handoff/DESIGN_TRACEABILITY.md`, and `docs/handoff/CURRENT_STATUS.md`.

**Interfaces:** Root `pnpm test` runs the comparator suite. The Fixture registry discovers `p0-canonical-comparator-v1`; its `inputs.actual` and `expected.canonical` artifacts contain JSON objects with `nodes` and `edges`. The comparator test loads those files and asserts all four required classes, exact field paths, and stable serialized output. No metric or CLI output is introduced.

- [ ] **Step 1: Write the failing golden test.** Extend the focused suite to load `fixtures/evaluation/comparator-v1/fixture.json`, select its declared `inputs.actual` and `expected.canonical` artifacts, and assert one semantic pair for `key-a`, one missing `key-b`, one extra `key-c`, and a resolution difference for `key-call` with `target.state`. Run the focused test now; expected FAIL because the Fixture does not exist. Then add the manifest below and `expected.json`/`actual.json` with this exact shape: each has `{ "nodes": [...], "edges": [...] }`; use the complete Task 1 node and Task 2 edge field sets. Expected has nodes `(e-a,key-a,name A)` and `(e-b,key-b,name B)` plus edge `(e-call,key-call,e-a,RESOLVED EXACT e-b)`. Actual has nodes `(a-a,key-a,name A changed)` and `(a-c,key-c,name C)` plus edge `(a-call,key-call,a-a,UNRESOLVED UNRESOLVED hint B with [])`. All use repository `repo`, revision `rev`, null source range and qualified name, and `{score:1,method:'fixture',reasons:[]}` confidence. Re-run the focused test and require GREEN.

```json
{
  "schemaVersion": 1,
  "id": "p0-canonical-comparator-v1",
  "category": "code-intelligence",
  "phase": "0",
  "languages": [],
  "frameworks": [],
  "capabilities": [],
  "inputs": { "actual": "actual.json" },
  "expected": { "canonical": "expected.json" },
  "criticalFacts": [],
  "qualityGates": {}
}
```

  Use `discoverFixtures` on `fixtures/evaluation` to select this ID, then read the two declared JSON files and call `compareCanonicalFacts`. Collect unmatched `classification` values and paired `differences.kind` values to assert the exact four distinct classifications. Do not let a golden file replace the edge-case tests from Tasks 1–2.

- [ ] **Step 2: Wire root tests and structure checks.** Append `packages/evaluation/test/canonical-comparator.test.mjs` to root `node --test` in `package.json`. In `scripts/test-workspace-structure.mjs`, assert the exact new export line and that root `scripts.test` contains the comparator test path. Run `node --test scripts/test-workspace-structure.mjs` before root script wiring to observe RED, then run it again to observe GREEN. Representative assertion:

```js
assert.match(manifest.scripts.test, /packages\/evaluation\/test\/canonical-comparator\.test\.mjs/);
```

- [ ] **Step 3: Synchronize authorities without changing frozen decisions.** Add the comparator input/result and matching/classification contract to `docs/handoff/specs/EVALUATION.md`. Replace the generic P0-W9-002 traceability Fixture cell with `p0-canonical-comparator-v1`, artifact paths, and the focused test; keep its existing Phase 0 gate. In `CURRENT_STATUS.md`, correct the stale P0-W9-001 integration statement using the verified merge revision, then add P0-W9-002 only after tests pass: commit/revision, Fixture ID, exact commands and pass counts, schema/dependency impact, failure behavior, known limitations, and next P0-W9-003. Do not claim hosted CI without a green hosted run.

- [ ] **Step 4: Run the full gate and record fresh numbers.** Run `pnpm --filter @codeatlas/evaluation build`, `node --test packages/evaluation/test/canonical-comparator.test.mjs`, `pnpm verify`, `git diff --check`, and inspect `git diff --stat`. Resolve any failure at its source; never lower an acceptance gate or rewrite a baseline to make it pass. Re-run relevant commands after the status/docs update so the recorded evidence matches the final tree.

- [ ] **Step 5: Commit only Task 3 changes.** Stage the Fixture, test/root wiring, lockfile if generated, and three handoff documents; commit `test(evaluation): prove canonical comparator acceptance`. A reviewer must inspect the entire branch against the design spec before integration.

## Plan self-review gate

- Spec coverage: Task 1 owns strict atomic input validation and conservative pairing; Task 2 owns graph-reference equivalence, all four classes, dual-class pairs, sorting, and immutability; Task 3 owns declared Fixture, root/architecture gates, and evidence.
- Type consistency: `validateFactSet`, `matchFacts`, `compareCanonicalFacts`, and `CanonicalComparatorError` have one spelling and stable interfaces across tasks; public exports appear only in Task 2.
- Review Focus: each of the five named failure modes has an explicit test in Tasks 1 or 2; Task 3 adds a golden end-to-end case rather than replacing focused tests.
- Scope: no metrics, CLI, baseline regeneration, provider normalization, IR schema change, persistence, or deferred capability.
