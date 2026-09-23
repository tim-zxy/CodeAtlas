# P0-W4-001 Provider and Plugin SPI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add runtime-verifiable Provider and Plugin SPIs, deterministic candidate routing, and a fake contract Fixture for P0-W4-001.

**Architecture:** `@codeatlas/providers` reuses Canonical IR and Native IPC schemas for descriptors, request validation, and complete analysis streams. `@codeatlas/plugins` exposes bounded canonical inputs and evidence-backed candidate output; both packages offer pure sorting/filtering functions, without execution orchestration. Fake implementations prove the public contract, and repository handoff documents record the evidence.

**Tech Stack:** TypeScript 7, Zod 4.6.1, Node.js 24 test runner, existing `@codeatlas/ir` and `@codeatlas/providers` Native IPC schemas.

**Spec:** `docs/superpowers/specs/2026-09-23-p0-w4-001-provider-plugin-spi-design.md`

## Global Constraints

- P0-W4-001 implements descriptors, capabilities, full/refresh analysis, plugin detection/extraction, and deterministic routing metadata; no Spring implementation.
- Preserve provider-independent Canonical IR and strict ProviderSnapshot v1. No SQLite, FactMerger, publication, runtime orchestrator, or Phase 1 semantic schema is added.
- Provider events must pass the existing Native IPC v1 envelope and complete-stream schemas before any result is applicable. The native client continues to own byte checksum verification.
- Plugin candidates remain candidate-only, JSON-safe, versioned, and supported by canonical input references. Phase 1 will validate their semantic payloads.
- Route order is `PRIMARY`, `SECONDARY`, `SHADOW`, then descending safe-integer priority and exact lexical provider ID; plugin routes sort by descending priority and exact lexical plugin ID.
- Use the existing Zod dependency and `@codeatlas/ir` contracts. Add only `@codeatlas/ir` and Zod to the plugins package; keep architecture rules intact.
- Every implementation task follows red-green-refactor and commits only its named files. Record fresh `pnpm verify` evidence in `CURRENT_STATUS.md` at the end.

## Review Focus

- An already-aborted signal and an abort during iteration must yield `CANCELLED` without an applicable partial stream; Task 2 tests both.
- A valid failed terminal event must be rejected as an applicable result, even though its IPC envelope is valid; Task 2 tests this.
- A positive plugin detection that cites a fact absent from its input must fail context validation; Task 3 tests this.
- A candidate with a declared capability but a support reference absent from its input must fail; Task 3 tests this.
- Reversing registration input order and requesting an unknown capability must respectively preserve route order and return an empty list; Tasks 1 and 4 test these.

---

## File map

- Create `fixtures/spi/provider-plugin-v1/cases.json`: one declared fake contract Fixture, task/spec/acceptance ownership, and closed case list.
- Create `packages/providers/src/provider-spi.ts`: provider descriptor, analysis request, and validated stream contract.
- Create `packages/providers/src/provider-routing.ts`: validated provider registration and pure candidate selection.
- Create `packages/providers/test/provider-spi.test.mjs` and `provider-routing.test.mjs`: fake provider and route contract tests.
- Modify `packages/providers/src/index.ts`: export the new public Provider SPI and route APIs.
- Create `packages/plugins/src/plugin-spi.ts`: descriptor, bounded context, detection, semantic candidate, and validation contract.
- Create `packages/plugins/src/plugin-routing.ts`: validated plugin registration and pure candidate selection.
- Create `packages/plugins/test/plugin-spi.test.mjs` and `plugin-routing.test.mjs`: fake plugin and route contract tests.
- Modify `packages/plugins/src/index.ts`, `packages/plugins/package.json`, and `pnpm-lock.yaml`: export the Plugin SPI and declare existing IR/Zod dependencies.
- Modify `package.json` and `scripts/test-workspace-structure.mjs`: register mandatory tests and the approved new public package surfaces.
- Modify `docs/handoff/specs/PROVIDER_SPI.md`, `PLUGIN_SPI.md`, `DESIGN_TRACEABILITY.md`, and `CURRENT_STATUS.md`: record concrete contract/Fixture behavior and fresh completion evidence.

### Task 1: Provider descriptor and deterministic route

**Files:**

- Create: `packages/providers/src/provider-spi.ts`
- Create: `packages/providers/src/provider-routing.ts`
- Create: `packages/providers/test/provider-routing.test.mjs`
- Modify: `packages/providers/src/index.ts`

**Interfaces:**

- Consumes: `ProviderIdSchema`, `ProviderVersionSchema` from `@codeatlas/ir`; Zod 4.6.1.
- Produces: `ProviderDescriptorSchema`, `ProviderDescriptor`, `ProviderRegistrationSchema`, `selectProviderCandidates(registrations, { languageId, requiredCapabilities }): readonly ProviderRegistration[]`.

- [ ] **Step 1: Write the failing descriptor and route tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderDescriptorSchema, selectProviderCandidates } from '../dist/index.js';

const descriptor = {
  providerId: 'provider-a', providerVersion: '1.0.0', protocolVersions: [1],
  irSchemaVersions: [1], languages: ['java'], capabilities: ['symbol', 'call'],
};
test('descriptor rejects duplicate capability and unknown fields', () => {
  assert.equal(ProviderDescriptorSchema.safeParse(descriptor).success, true);
  assert.equal(ProviderDescriptorSchema.safeParse({ ...descriptor, capabilities: ['call', 'call'] }).success, false);
  assert.equal(ProviderDescriptorSchema.safeParse({ ...descriptor, extra: true }).success, false);
});
test('routes filter capabilities and are independent of registration input order', () => {
  const entries = [
    { descriptor, role: 'SECONDARY', priority: 5 },
    { descriptor: { ...descriptor, providerId: 'provider-b' }, role: 'PRIMARY', priority: 0 },
  ];
  const request = { languageId: 'java', requiredCapabilities: ['call'] };
  assert.deepEqual(selectProviderCandidates(entries, request).map((entry) => entry.descriptor.providerId), ['provider-b', 'provider-a']);
  assert.deepEqual(selectProviderCandidates([...entries].reverse(), request), selectProviderCandidates(entries, request));
  assert.deepEqual(selectProviderCandidates(entries, { ...request, requiredCapabilities: ['override'] }), []);
  assert.throws(() => selectProviderCandidates([entries[0], entries[0]], request));
});
```

- [ ] **Step 2: Build and run the focused test to observe the missing API**

Run: `pnpm --filter @codeatlas/providers build` then `node --test packages/providers/test/provider-routing.test.mjs`.
Expected: the test fails because the public exports do not exist.

- [ ] **Step 3: Implement strict descriptor and pure route**

In `provider-spi.ts`, use strict Zod objects with `ProviderIdSchema`, `ProviderVersionSchema`, nonempty positive safe-integer version arrays, and exact nonempty string arrays. Add duplicate checks per array and export types inferred from schemas. In `provider-routing.ts`, validate the whole input, reject duplicate provider IDs, filter every required capability, and sort a copied list:

```ts
const roleRank = { PRIMARY: 0, SECONDARY: 1, SHADOW: 2 } as const;
return eligible.sort((a, b) =>
  roleRank[a.role] - roleRank[b.role] ||
  b.priority - a.priority ||
  (a.descriptor.providerId < b.descriptor.providerId ? -1 : a.descriptor.providerId > b.descriptor.providerId ? 1 : 0),
);
```

Avoid mutating the caller's registration array. Export both files from `index.ts`.

- [ ] **Step 4: Build and rerun the focused test**

Run: `pnpm --filter @codeatlas/providers build` then `node --test packages/providers/test/provider-routing.test.mjs`.
Expected: all focused tests pass.

- [ ] **Step 5: Commit this independently testable provider descriptor/route**

Run `git add` on the four Task 1 files only, then `git commit -m "feat: define provider descriptor and routing metadata"`.

### Task 2: Full/refresh provider contract and validated stream

**Files:**

- Modify: `packages/providers/src/provider-spi.ts`
- Create: `packages/providers/test/provider-spi.test.mjs`
- Create: `fixtures/spi/provider-plugin-v1/cases.json`

**Interfaces:**

- Consumes: `AnalyzeRequestPayloadSchema`, `RefreshRequestPayloadSchema`, `NativeEventStreamSchema`, `NativeEventEnvelope` from `native-ipc.ts`; `JsonValueSchema` and `parseIr` from `@codeatlas/ir`.
- Produces: `FullAnalysisRequestSchema`, `RefreshAnalysisRequestSchema`, their inferred types, `CodeIntelligenceProvider`, `validateProviderStream(request, events): Promise<NativeEventStream>`, and typed `ProviderContractError` with `CANCELLED` or `PROVIDER_FAILED`.

- [ ] **Step 1: Declare the Fixture and write fake-provider tests**

Create `cases.json` with `schemaVersion: 1`, `fixtureId: "p0-provider-plugin-spi-v1"`, `task: "P0-W4-001"`, `governingSpecs: ["Provider SPI", "Plugin SPI"]`, acceptance `"Descriptors, capabilities, analysis contracts, plugin detection/extraction, and deterministic routing metadata"`, and cases `descriptor`, `analyze`, `refresh`, `cancellation`, `failed-terminal`, `invalid-event`, `coverage-diagnostic`, `unresolved-target`, `plugin-detection`, `plugin-extraction`, `provider-routing`, `plugin-routing`.

Use the valid full/refresh request and event shapes already exercised by `packages/providers/test/native-ipc.test.mjs` to build a fake provider. The test must call the public interface and helper, not the native client. Pin the contract with these assertions:

```js
const full = { envelope: analyzeRequest, configuration: {}, signal: new AbortController().signal };
const fake = { describe: async () => descriptor, analyze: async function* () { yield* analyzeEvents(); }, refresh: async function* () { yield* refreshEvents(); } };
assert.equal((await validateProviderStream(full, fake.analyze(full))).events.at(-1).type, 'ANALYSIS_COMPLETED');
assert.deepEqual(await validateProviderStream(full, fake.analyze(full)), await validateProviderStream(full, fake.analyze(full)));
await assert.rejects(() => validateProviderStream(full, invalidEvents()), { code: 'IR_VALIDATION_FAILED' });
await assert.rejects(() => validateProviderStream(full, failedEvents()), { code: 'PROVIDER_FAILED' });
```

Also assert `REFRESH` accepts `UPSERT_*`/`REMOVE_*` and rejects an `ANALYZE` event; coverage/diagnostic and unresolved target survive without normalization; an already-aborted and midstream-aborted signal rejects with `CANCELLED` and exposes no result.

- [ ] **Step 2: Build and run the failing test**

Run: `pnpm --filter @codeatlas/providers build` then `node --test packages/providers/test/provider-spi.test.mjs`.
Expected: missing request and stream exports fail.

- [ ] **Step 3: Implement the minimal request and stream boundary**

Use this public interface in `provider-spi.ts`; infer the request types from strict Zod schemas with an exact `ANALYZE`/`REFRESH` envelope, `JsonValueSchema` configuration, and an `AbortSignal` custom check:

```ts
export type FullAnalysisRequest = z.infer<typeof FullAnalysisRequestSchema>;
export type RefreshAnalysisRequest = z.infer<typeof RefreshAnalysisRequestSchema>;
export interface CodeIntelligenceProvider {
  describe(): Promise<ProviderDescriptor>;
  analyze(request: FullAnalysisRequest): AsyncIterable<NativeEventEnvelope>;
  refresh(request: RefreshAnalysisRequest): AsyncIterable<NativeEventEnvelope>;
}
```

Build `FullAnalysisRequestSchema` and `RefreshAnalysisRequestSchema` from the existing request-envelope union's matching variants; check `signal instanceof AbortSignal` without serializing it. Iterate into a private array bounded by the request's `maxEvents`. Race each pending `iterator.next()` against an abort promise, remove the listener after settlement, and call `iterator.return?.()` on cancellation. Validate `{ request: envelope, events }` using `parseIr(NativeEventStreamSchema, ...)`, then reject `ANALYSIS_FAILED`, `REFRESH_FAILED`, and `REQUEST_FAILED` terminal events with `ProviderContractError`. Return only a complete validated stream; never yield or return the private array early. Keep the helper independent from process spawning and SQLite.

- [ ] **Step 4: Build and rerun fake stream and existing IPC tests**

Run: `pnpm --filter @codeatlas/providers build` then `node --test packages/providers/test/provider-spi.test.mjs packages/providers/test/native-ipc.test.mjs`.
Expected: both suites pass; invalid/failed/cancelled streams yield no applicable result.

- [ ] **Step 5: Commit the provider stream contract and Fixture**

Run `git add` on the three Task 2 files only, then `git commit -m "feat: validate provider analysis streams"`.

### Task 3: Plugin descriptor, detection, and candidate contract

**Files:**

- Create: `packages/plugins/src/plugin-spi.ts`
- Create: `packages/plugins/test/plugin-spi.test.mjs`
- Modify: `packages/plugins/src/index.ts`
- Modify: `packages/plugins/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `CanonicalNodeSchema`, `CanonicalEdgeSchema`, `CanonicalFactRefSchema`, `SourceFileSchema`, `ProviderSnapshotDiagnosticSchema`, `JsonValueSchema`, and `SchemaEnvelopeSchema` from `@codeatlas/ir`.
- Produces: `PluginDescriptorSchema`, `DetectionContextSchema`, `DetectionResultSchema`, `SemanticExtractionContextSchema`, `SemanticFactSchema`, `FrameworkPlugin`, `validateDetectionResult(context, result)`, and `validateSemanticFact(context, descriptor, fact)`.

- [ ] **Step 1: Add dependencies and write the failing fake-plugin tests**

Declare `@codeatlas/ir: workspace:*` and `zod: 4.6.1` in the plugins package. Use `pnpm install --lockfile-only` to update the lockfile without introducing a new dependency version. Add tests that instantiate one valid canonical node using the exact fields of `CanonicalNodeSchema`, then assert:

```js
const support = { factType: 'NODE', id: node.id };
const context = { repositoryId: 'repo-a', revisionId: 'rev-a', nodes: [node], edges: [], sourceFiles: [], configuration: {} };
const descriptor = { pluginId: 'spring', pluginVersion: '1.0.0', languages: ['java'], frameworks: ['spring'], requiredProviderCapabilities: ['symbol'], producedSemanticCapabilities: ['entry-point'], configurationSchema: { schema: 'spring-config', version: 1 }, trustClass: 'BUILT_IN' };
const detection = { matched: true, support: [support], diagnostics: [] };
assert.equal(PluginDescriptorSchema.safeParse(descriptor).success, true);
assert.deepEqual(validateDetectionResult(context, detection), detection);
assert.throws(() => validateDetectionResult(context, { ...detection, support: [{ factType: 'NODE', id: 'missing' }] }));
assert.throws(() => validateDetectionResult(context, { matched: false, support: [support], diagnostics: [] }));
assert.deepEqual(validateSemanticFact(context, descriptor, { capability: 'entry-point', value: { schema: 'entry-point-candidate', version: 1, payload: {} }, support: [support] }).capability, 'entry-point');
assert.throws(() => validateSemanticFact(context, descriptor, { capability: 'unknown', value: { schema: 'x', version: 1, payload: {} }, support: [support] }));
```

Test unknown descriptor fields, duplicate capability IDs, non-JSON configuration/payload, empty positive-detection support, absent candidate support, and candidate-only behavior. A fake `FrameworkPlugin` must implement `describe`, `detect`, and an async `extract` yielding the candidate.

- [ ] **Step 2: Install from the existing lockfile and run the failing plugin test**

Run: `pnpm install --frozen-lockfile` after the lockfile update, then `pnpm --filter @codeatlas/plugins build`, then `node --test packages/plugins/test/plugin-spi.test.mjs`.
Expected: the test fails because the new public API is absent.

- [ ] **Step 3: Implement strict plugin schemas and contextual validators**

In `plugin-spi.ts`, define strict descriptor/configuration reference schemas, unique exact-string arrays, and `trustClass: z.literal('BUILT_IN')`. Define `DetectionContextSchema` with repository/revision IDs, canonical node/edge arrays, source file metadata, and JSON-safe configuration. Set `MAX_PLUGIN_CONTEXT_FACTS = 10_000` across nodes plus edges and `MAX_PLUGIN_SOURCE_FILES = 10_000`; reject larger contexts before invoking a plugin. `DetectionResultSchema` requires `matched`, `support`, and `diagnostics`; `SemanticExtractionContextSchema` extends the detection context with a positive validated detection result; `SemanticFactSchema` requires `capability`, `value: SchemaEnvelopeSchema`, and nonempty `support`.

The contextual validators use `parseIr` and compare each support pair `(factType, id)` against a `Set` made from context nodes/edges. Reject nodes, edges, or source files whose repository/revision IDs differ from the context. `validateDetectionResult` rejects positive results without support and negative results with support. `validateSemanticFact` rejects capabilities absent from the descriptor and duplicate/absent support. Export `FrameworkPlugin` with `describe(): PluginDescriptor`, `detect(input: DetectionContext): Promise<DetectionResult>`, and `extract(input: SemanticExtractionContext): AsyncIterable<SemanticFact>`. Export the new API from `index.ts`.

- [ ] **Step 4: Build and rerun the focused test**

Run: `pnpm --filter @codeatlas/plugins build` then `node --test packages/plugins/test/plugin-spi.test.mjs`.
Expected: fake-plugin contract tests pass.

- [ ] **Step 5: Commit the plugin contract**

Run `git add` on the five Task 3 files only, then `git commit -m "feat: define evidence-backed plugin SPI"`.

### Task 4: Plugin routing, root integration, and acceptance evidence

**Files:**

- Create: `packages/plugins/src/plugin-routing.ts`
- Create: `packages/plugins/test/plugin-routing.test.mjs`
- Modify: `packages/plugins/src/index.ts`
- Modify: `package.json`
- Modify: `scripts/test-workspace-structure.mjs`
- Modify: `docs/handoff/specs/PROVIDER_SPI.md`
- Modify: `docs/handoff/specs/PLUGIN_SPI.md`
- Modify: `docs/handoff/DESIGN_TRACEABILITY.md`
- Modify: `docs/handoff/CURRENT_STATUS.md`

**Interfaces:**

- Consumes: `PluginDescriptorSchema` and Task 3 descriptor type.
- Produces: `PluginRegistrationSchema`, `selectPluginCandidates(registrations, { languageId, frameworkId, providerCapabilities }): readonly PluginRegistration[]`; root test/traceability integration.

- [ ] **Step 1: Write failing plugin-route and root-fixture tests**

```js
const request = { languageId: 'java', frameworkId: 'spring', providerCapabilities: ['symbol'] };
const entries = [
  { descriptor: { ...descriptor, pluginId: 'plugin-b' }, priority: 1 },
  { descriptor: { ...descriptor, pluginId: 'plugin-a' }, priority: 1 },
];
assert.deepEqual(selectPluginCandidates(entries, request).map((entry) => entry.descriptor.pluginId), ['plugin-a', 'plugin-b']);
assert.deepEqual(selectPluginCandidates([...entries].reverse(), request), selectPluginCandidates(entries, request));
assert.deepEqual(selectPluginCandidates(entries, { ...request, providerCapabilities: [] }), []);
assert.throws(() => selectPluginCandidates([entries[0], entries[0]], request));
```

In `plugin-spi.test.mjs`, read `fixtures/spi/provider-plugin-v1/cases.json` and assert exact Fixture ID/task/spec/acceptance fields and the 12 declared case names. Update `scripts/test-workspace-structure.mjs` to expect the new Provider/Plugin exports and the plugins dependency pair; assert root `test` includes all four SPI test files.

- [ ] **Step 2: Run focused tests and observe the missing route/root registration**

Run: `pnpm --filter @codeatlas/plugins build` then `node --test packages/plugins/test/plugin-routing.test.mjs scripts/test-workspace-structure.mjs`.
Expected: the new route is missing and structure expectations fail until public surfaces/root script are updated.

- [ ] **Step 3: Implement route and register the suite**

Validate registrations, reject duplicate plugin IDs, filter language/framework and every required provider capability, then sort a copied array by descending safe-integer priority and exact lexical plugin ID. Export the route from plugins `index.ts`. Add four test files to root `pnpm test`, update the structure test's expected exports/dependencies, and keep the architecture allowlist unchanged.

- [ ] **Step 4: Synchronize authority documents and run the declared gates**

Document exact request/event and plugin candidate rules in the two SPI specs. Expand P0-W4-001 in `DESIGN_TRACEABILITY.md` with the fixture path, test files, and `Descriptors, capabilities, analysis contracts` gate. Run `pnpm verify`, `git diff --check`, and inspect the architecture output. In `CURRENT_STATUS.md`, append the task ID, `p0-provider-plugin-spi-v1`, governing specs, exact command/results, architecture/deferred checks, contract changes, and known limitations. Re-run `pnpm verify` after documentation edits if formatting is affected. Do not claim hosted CI without a run.

- [ ] **Step 5: Commit the integrated, verified task**

Run `git add` on the nine Task 4 files only, then `git commit -m "feat: complete P0-W4-001 SPI acceptance"`. Verify `git show --stat --oneline HEAD` and `git diff --check` before reporting completion.

## Plan self-review checkpoints

- Provider descriptor/route, full/refresh stream, plugin descriptor/detection/extraction, and plugin route each have a task and focused tests.
- The Fixture has a task/spec/gate owner and is mandatory under root `pnpm test`/`pnpm verify`.
- No task adds Canonical IR semantic payloads, persistence, orchestration, third-party loading, or framework extraction.
- `CURRENT_STATUS.md` is updated only with fresh measured results, and no hosted CI is inferred from local verification.
