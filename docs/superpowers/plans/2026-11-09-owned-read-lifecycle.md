# Owned Read Lifecycle Implementation Plan

Goal: fill existing P1-18 coordination gap without production Source access or new public contracts.
Spec: ../specs/2026-11-09-owned-read-lifecycle.md

- [x] Runtime isolated stream: owned-read-lifecycle.ts + owned-read-lifecycle.test.mjs; strict captured scope/limits, startup then optional watcher then postattach pass, bounded coalesced dirty state/generation, serialized callback controls, failure/no retry, immediate abort and joined late ownership/UNKNOWN. RED then deterministic promise-gate tests. No shared indexes/build/Git.
- [x] Root managed SDK host: capture same scope, construct Runtime coordinator plus existing genuine structure-read toolset, gate start/dispatch/delivery by READY+generation, immediate joined shutdown with no start/close cycle. Actual owned child SDK demonstrates order/metadata reconciliation/query invalidation/normal old routes. No user files or production watcher.
- [x] Root unified verification: affected Runtime/MCP builds and tests, old SDK compatibility, architecture/format and independent review; update factual authority/trace and exact-file commit/push. Follow existing CI200 only, no duplicate tests/dispatch. Preserve old EOL-only changes and local evidence.


## Verification, review and limits

Existing controlling P1-18/consumption §9 requires MCP watcher coordination and
ONE_SHOT startup reconciliation; this slice implements private callback coordination
and an additive owned managed-host factory. It creates no production Source adapter,
observer, grant, new wire schema or persisted session state. Root was sole integrator;
Runtime implementation and its tests were file-isolated, builds serialized.

API absence RED1/1 for managed host and absent Runtime module was observed. Initial
Runtime build lost number narrowing in a nested control factory; fixed by a frozen
validated bounds object, also bounding scope cardinality and safe deadline sums.
Adding readonly cancellation observation initially exposed unnameable Node AbortSignal
declaration; explicit OwnedReadLifecycle interface uses the existing Application
control signal type, with no new dependency/runtime import. Independent read-only
review found a local spec wording mismatch ('optional MCP observer'); corrected to
the controlling requirement: MCP_STDIO needs an explicit observer port, ONE_SHOT is
the no-observer path. No runtime behavior or frozen requirement was weakened.

Review reports no concrete P1/P2 code finding. Managed close stores its promise
before invoking component closure, immediately propagates the lifecycle's observed
abort to SDK contexts, joins pending startup and late observer cleanup, and avoids
start/close self-await. A closed host cannot reuse its already-resolved start task.

Fresh final related run:107tests/107pass/0fail/cancel/skip/todo,53529.0299ms. Runtime and
MCP builds exit0, architecture17 and exact source/test/package Prettier plus whitespace
checks pass. Initial Runtime15 and managed SDK8 overlap this107 and are not summed.
Local raw log: .superpowers/sdd/2026-11-09-owned-read-lifecycle/final-related.log
(ignored local evidence, not claimed uploaded). Reproduce from continuation worktree:

```powershell
node node_modules/typescript/bin/tsc -p packages/runtime/tsconfig.json
node node_modules/typescript/bin/tsc -p apps/mcp/tsconfig.json
node --test --test-concurrency=1 packages/runtime/test/owned-read-lifecycle.test.mjs packages/runtime/test/runtime-bootstrap.test.mjs apps/cli/test/smoke.test.mjs apps/mcp/test/owned-business-stdio.test.mjs apps/mcp/test/owned-extended-read-tools.test.mjs apps/mcp/test/owned-five-read-tools.test.mjs apps/mcp/test/owned-knowledge-search.test.mjs apps/mcp/test/owned-project-context.test.mjs apps/mcp/test/owned-read-toolset.test.mjs apps/mcp/test/owned-structure-read-tools.test.mjs apps/mcp/test/owned-managed-read-tools.test.mjs apps/mcp/test/smoke.test.mjs scripts/test-runtime-construction.mjs scripts/test-workspace-structure.mjs scripts/test-architecture-rules.mjs
node scripts/check-architecture.mjs
```

Tests cover startup/postattach gap, coalesced event generations/severity and serial
passes, failure/no retry, ONE_SHOT, safe controls, late and reentrant observer ownership,
ignored cancellation, UNKNOWN, strict scope and host mutation. Official SDK children
use real self-owned readonly Runtime Store metadata in reconciliation callbacks and
controlled observer doubles; no live Source or real missed-change proof. An event
inside a real query completes its metadata reconciliation back to READY before
query return, yet the old generation result is refused; the next request succeeds.
Old single/three/five/extended/structure factories and CLI/MCP bootstrap remain tested.

CI200 exact0b99ae6 is terminal TS/Rust success, Native R8 catalog mismatch with
D5_SCRIPT_PREREQUISITE_FAILED and qualification skipped (confirmed complete job log).
No duplicate run/dispatch. New automatic CI belongs to the exact new commit only.
Raw callbacks/diagnostic readiness are not source freshness or authority; real OS
observer/project reconciliation, full six tools, production query/publication/data,
R9 and original quality gates remain open/closed as before. Phase1 stays4/21,
A6 NOT_QUALIFIED, E02 PROPOSED/uninstalled. Rollback disables the additive managed
factory/coordinator; original service paths and immutable history remain.
