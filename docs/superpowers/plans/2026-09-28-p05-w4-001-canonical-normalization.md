# P05-W4-001 Canonical Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize completed Native Java Provider nodes and edges into provider-independent Canonical Code IR with deterministic FactKeys and no premature persistence or merge.

**Architecture:** Keep the strict IR schemas unchanged. A pure `@codeatlas/providers` entry point revalidates the completed Native result, maps nodes before edges, and returns ordered Provider-to-Canonical pairs plus a node-reference lookup. Identity hashing is isolated from Java mapping; FactMerger, SQLite apply, and publication remain separate tasks.

**Tech Stack:** TypeScript 7, Node.js 24 crypto/test runner, existing Zod 4 IR/IPC schemas, Fixture Registry v1.

**Spec:** `docs/superpowers/specs/2026-09-28-p05-w4-001-canonical-normalization-design.md`

## Global Constraints

- No Canonical IR/Provider Fact schema, Native IPC, ProviderSnapshot, SQLite migration, or numerical Quality Gate change.
- Accept only complete v1/v2 `ANALYZE` streams ending in `ANALYSIS_COMPLETED` with `SUCCEEDED` or `PARTIAL`; retain partial-coverage limitations without publishing a graph.
- Use SHA-256 over domain-separated, UTF-8 length-delimited tuples. Domains: `node-fact-v1`, `edge-fact-v1`, `canonical-node-v1`, `canonical-edge-v1`.
- Reject unknown Provider kinds and invalid references atomically; never guess a target, fabricate a source location, or infer facts from stderr.
- Do not deduplicate independent Provider support, aggregate confidence, write Evidence/bindings/SQLite, or perform REFRESH in this task.
- Use existing registered Java Native goldens as inputs; do not rewrite their v1 facts. No new numeric threshold.

## Review Focus

- Two Provider candidate refs can collapse onto one Canonical package identity: Task 3 tests unique Canonical candidates and rejects an `AMBIGUOUS` target reduced below two.
- A `PARTIAL` completed stream may contain valid facts: Task 3 tests normalization without implying active-graph publication; failed terminals return no batch.
- Same-name overloads in one file differ only by name span: Task 2 tests distinct keys; pure line movement is documented as a known limitation.
- A source file ID or compilation-unit path can disagree with the request: Task 2 tests rejection rather than accepting a detached location.
- Node/edge event completion order can differ while IPC sequence stays valid: Task 3 tests identical ordered Canonical output for semantically equivalent valid streams.

---

## File structure

| File | Responsibility |
| --- | --- |
| `packages/providers/src/canonical-fact-identity.ts` | Versioned tuple encoding and domain-specific FactKey/Canonical ID derivation only. |
| `packages/providers/src/java-node-normalizer.ts` | Reviewed Java ProviderNode-kind mapping and node/location validation only. |
| `packages/providers/src/canonical-normalizer.ts` | Completed-stream validation, context and reference checks, edge mapping, deterministic ordered batch. |
| `packages/providers/src/index.ts` | Export the public normalization entry point/types. |
| `packages/providers/test/canonical-fact-identity.test.mjs` | Independent pinned identity vectors/invariance tests. |
| `packages/providers/test/java-node-normalizer.test.mjs` | Exact node mapping, overload, package, compilation-unit, invalid-location tests. |
| `packages/providers/test/canonical-normalizer.test.mjs` | Completed-stream, edge-target, failure, ordering, and registered-Fixture tests. |
| `fixtures/normalization/canonical-normalization/{fixture.json,inputs/result.json,expected/nodes.json,expected/edges.json}` | Registered exact Provider input and Provider-to-Canonical goldens. |
| `package.json` | Include the three new test files in the root-declared Node fileset. |
| `docs/handoff/{CURRENT_STATUS.md,DESIGN_TRACEABILITY.md}` | Reproducible task evidence and accepted contract/Fixture trace. |

### Task 1: Versioned identity derivation

**Files:** Create `packages/providers/src/canonical-fact-identity.ts`; test `packages/providers/test/canonical-fact-identity.test.mjs`.

**Interfaces:** Produce `nodeFactKey(fields: readonly (string | number)[]): NodeFactKey`, `edgeFactKey(fields: readonly (string | number)[]): EdgeFactKey`, and `canonicalFactId(factType: 'NODE' | 'EDGE', factKey: NodeFactKey | EdgeFactKey): CanonicalId`. Task 2 owns field selection; Task 3 uses the same helpers for edges.

- [ ] **Step 1: Write failing vector tests.** Assert `nodeFactKey(['repo-fixture', 'rev-fixture', 'PACKAGE', 'demo'])` equals `node-fact-v1:e3058dd65a50ac30faeaf863cb1cb4ba95b7d76ac78ef2b28e4a2d98898597c1`; its node ID equals `canonical-node-v1:a8ec6366dcc13d35b8539d3fcc1aaadb0e0233e1773825f3ae06612a49865c1e`. Assert an embedded colon/NUL field cannot collide with two separate fields, UTF-8 byte length is used, a changed repository/revision changes the digest, and output parses under the branded IR schemas.
- [ ] **Step 2: Run** `node --test packages/providers/test/canonical-fact-identity.test.mjs`; expect failure because the module/function does not exist.
- [ ] **Step 3: Implement** the three signatures above using Node `createHash('sha256')`, exact decimal byte lengths, and the four distinct domain labels. No Provider metadata may enter this module.
- [ ] **Step 4: Build `@codeatlas/providers`, rerun the targeted test; expect all cases pass.** Run the local direct TypeScript compiler if the pnpm wrapper attempts an install.
- [ ] **Step 5: Commit** only this source and test as `feat(providers): derive canonical fact identities`.

### Task 2: Reviewed Java node mapping

**Files:** Create `packages/providers/src/java-node-normalizer.ts`; test `packages/providers/test/java-node-normalizer.test.mjs`.

**Interfaces:** Consume Task 1 helpers. Produce `normalizeJavaNode(node: ProviderNode, sourceFiles: ReadonlyMap<string, SourceFile>): CanonicalNode`. Define `CanonicalNormalizationError` with `code: 'UNSUPPORTED_KIND' | 'INVALID_FACT' | 'INVALID_CONTEXT' | 'MISSING_REFERENCE'` and `path: readonly (string | number)[]`; Task 3 reuses it. Task 3 supplies already validated Provider objects and the request SourceFile map.

- [ ] **Step 1: Write failing mapping tests.** Assert package declaration and synthetic container share one FactKey while retaining their distinct nullable display ranges; compilation unit becomes file-scoped `MODULE`; class/interface become `TYPE` subkinds; method/constructor/field become `SYMBOL` subkinds. Assert two same-qualified-name overloads with different name ranges have different FactKeys; changing Provider ID/snapshot/fact ID does not change identity. Parse every output with `CanonicalNodeSchema`.
- [ ] **Step 2: Write failing rejection tests.** Assert unknown kind, missing qualified name, missing source-backed range, unknown SourceFile ID, cross-revision SourceFile, and compilation-unit path not in the request fail with stable diagnostic paths and no Canonical node.
- [ ] **Step 3: Run** `node --test packages/providers/test/java-node-normalizer.test.mjs`; expect the missing-module failure.
- [ ] **Step 4: Implement** the exact kind and tuple-field map from the accepted spec. Use the request's repository-relative `SourceFile.path` for `MODULE`; preserve Provider confidence as supplied. Do not parse Java source or synthesize `OVERRIDE`.
- [ ] **Step 5: Build and rerun both targeted test files; expect all pass. Commit** this source and test as `feat(providers): map Java provider nodes`.

### Task 3: Completed analysis and edge normalization

**Files:** Create `packages/providers/src/canonical-normalizer.ts`; modify `packages/providers/src/index.ts`; test `packages/providers/test/canonical-normalizer.test.mjs`.

**Interfaces:** Consume Task 2's `normalizeJavaNode` and Task 1's edge/ID helpers. Export `normalizeNativeAnalysis(result: ValidatedNativeResult): NormalizedCanonicalAnalysis` where `NormalizedCanonicalAnalysis` contains `nodes: readonly { provider: ProviderNodeRef; canonical: CanonicalNode }[]`, `edges: readonly { provider: ProviderFactRef; canonical: CanonicalEdge }[]`, and `nodeRefsByProviderFactId: ReadonlyMap<ProviderFactId, CanonicalNodeRef>`. The map is a lookup, not a deduplicated support collection.

- [ ] **Step 1: Write failing stream tests.** Assert one valid v1 and one valid v2 completed `ANALYZE` normalize; `PARTIAL` completes with facts but causes no persistence; `DESCRIBE`, `REFRESH`, failed/missing terminal, wrong counts/context, duplicate Provider Fact IDs, and an absent source/target/candidate ref fail atomically. Use the existing complete-stream schemas for version-specific request/event revalidation; do not treat this revalidation as raw-byte checksum verification.
- [ ] **Step 2: Write failing edge tests.** Assert normal/static/wildcard imports map to `IMPORT`, calls/inheritance/references to their Canonical kinds; resolved targets map by Canonical node ref, non-resolved hint/resolution/candidates remain non-resolved, and confidence/callsite are preserved. Test exact edge-key tuple order, identity independence from Provider IDs, duplicate Canonical-candidate handling, `AMBIGUOUS` cardinality after collapse, null-callsite/unknown-kind rejection, and output passing `CanonicalEdgeSchema`.
- [ ] **Step 3: Write failing ordering tests.** Semantically identical valid streams with different event completion order produce the same ordered pairs/keys/IDs; only collection-stage order changes, not IPC sequence or checksums. Duplicate support pairs remain separate. Assert no Provider ID appears in Canonical objects.
- [ ] **Step 4: Run** `node --test packages/providers/test/canonical-normalizer.test.mjs`; expect missing export/module failure.
- [ ] **Step 5: Implement** request/event context validation, node-first lookup, edge mapping, full-batch validation, and deterministic FactKey/Provider-ref sorting. Reject on the first controlled error with no returned partial batch. Export only the public entry point/types, not Java-internal helpers.
- [ ] **Step 6: Build and rerun all three targeted test files; expect all pass. Commit** source, export, and test as `feat(providers): normalize completed Native analysis`.

### Task 4: Registered golden, full gates, and handoff evidence

**Files:** Create the four `fixtures/normalization/canonical-normalization/` files from the file-structure table; modify `packages/providers/test/canonical-normalizer.test.mjs`, root `package.json`, `docs/handoff/CURRENT_STATUS.md`, and `docs/handoff/DESIGN_TRACEABILITY.md`.

**Interfaces:** Consume Task 3's public API. The Fixture manifest uses registry v1, ID `canonical-normalization`, phase `0.5`, category `code-intelligence`, input `result`, expected `nodes`/`edges`, no invented numeric gate. Expected arrays contain complete ordered Provider-to-Canonical pairs, not just bare Canonical objects.

- [ ] **Step 1: Write the Fixture and failing test.** Construct a completed Provider stream by curating existing Native `java-overload`, `java-call-basic`, and `java-inheritance` golden facts into one consistent request/snapshot context, preserving their source-backed semantics. Include package duplicates, synthetic container, compilation units, all reviewed node/edge kinds, and resolved/non-resolved targets; fail Fixture construction if Provider Fact IDs collide or referenced nodes are absent. Assert registry discovery, exact pair equality with both expected JSON arrays, and separately compare unique-key Canonical subsets through the existing comparator; do not feed duplicate-support output directly to the comparator. In additional tests, normalize the three unchanged source Fixture goldens in their own valid request contexts.
- [ ] **Step 2: Run** `node --test packages/providers/test/canonical-normalizer.test.mjs`; expect a missing-Fixture or golden mismatch, then fill exact expected key/ID vectors from the Task 1 algorithm and re-run to pass. Golden changes require review, not automatic baseline overwrite.
- [ ] **Step 3: Add all three test files to root `test`; run the declared root Node fileset, 16 TypeScript builds and IR type tests, architecture check, Prettier, and `git diff --check`. Run Native Java source Fixtures unchanged. If the desktop pnpm wrapper blocks before the scripts, run the direct constituent commands and record that limitation; require hosted clean-install CI before claiming hosted gates.
- [ ] **Step 4: Check** no schema/migration/ADR change, no premature FactMerger/apply/REFRESH/Knowledge feature, all registered Fixture paths valid, and no stale or partial graph publication. Update `CURRENT_STATUS.md` with exact commands/counts, limits, and next dependency-valid task P05-W4-002; update traceability with the registered Fixture and evidence.
- [ ] **Step 5: Commit** only the Fixture, tests, root test registration, and handoff evidence as `test(providers): pin canonical normalization fixture`.

## Handoff after implementation

Run an independent whole-branch review if available, then present exact local and hosted evidence separately. Do not claim Phase 0.5 exit from this task. A PR is a separate integration step after review; P05-W4-002 must not start until this contract and its goldens are accepted.
