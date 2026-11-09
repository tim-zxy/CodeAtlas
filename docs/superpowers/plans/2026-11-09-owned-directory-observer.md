# Owned Directory Observer Implementation Plan

Goal: provide actual owned-temporary OS event input for the existing lifecycle port,
without accepting project paths or enabling production observation.
Spec: ../specs/2026-11-09-owned-directory-observer.md

- [x] Runtime isolated stream: owned-directory-observer.ts + owned-directory-observer.test.mjs; missing API RED, fresh exclusive temp root, immutable scope/control, actual Node fs.watch notifications and normalized CHANGE/OVERFLOW, readonly failure signal, idempotent joined native close/late cancellation/UNKNOWN. No body/path adoption/recursivewatch/cleanup/new dependency.
- [x] Root SDK fixture integration: existing managed factory only, observer signal closes host, close-only handle satisfies original lifecycle port. Independent owned-file writer actor and actual Runtime readonly query prove event/generation invalidation; ordinary managed and old factories remain compatible. No product data write in query path.
- [x] Root builds Runtime/MCP, targeted tests and old relevant lifecycle/SDK compatibility, architecture/format and fresh independent review. Update exact factual evidence/trace, scoped commit/push and track same CI201/new automatic run; no rerun or production actions.


## Verification and preserved scope

Both API-absence RED checks were observed before new compiled APIs. Runtime source
uses canonical realpath(OS temp), exclusive mkdtemp and lstat bigint pre/post native
attachment identity. Returned native signal uses existing Application control type
through explicit interface. Declared async/proxy listeners refuse before allocation;
other dishonest callback results fail immediately, with native rejection observed via
intrinsic Promise.then rather than an overridable catch getter. No body read, path
adoption, filename retention/publication, recursive watch, delete, dependency, new
event type, public tool schema or production Source grant was introduced.

Real OS watch tests were permitted; no denial, alternate route, retry or polling
fallback. Controlled native error/unknown/late-attach tests temporarily intercept
fs.watch and synchronize builtin ESM exports only inside their isolated test process,
always creating a real original OS watcher and restoring hooks in finally. Unexpected
close invokes the real native close; it is not a fabricated close event masking a
live handle. Listener/error tests confirm actual closure and retained UNKNOWN.

Fresh independent read-only review reports no concrete P1/P2 finding. Final related
run72tests/72pass/0fail/cancel/skip/todo,23776.975ms. Runtime/MCP builds exit0,
architecture17, exact-source/test/package Prettier and whitespace checks pass. Initial
Runtime10 and SDK3 overlap final72 and are not summed. Local raw result:
.superpowers/sdd/2026-11-09-owned-directory-observer/final-related.log (ignored local
evidence, not claimed uploaded). Reproduce from continuation worktree:

```powershell
node node_modules/typescript/bin/tsc -p packages/runtime/tsconfig.json
node node_modules/typescript/bin/tsc -p apps/mcp/tsconfig.json
node --test --test-concurrency=1 packages/runtime/test/owned-directory-observer.test.mjs packages/runtime/test/owned-read-lifecycle.test.mjs packages/runtime/test/runtime-bootstrap.test.mjs apps/mcp/test/owned-directory-observer.test.mjs apps/mcp/test/owned-managed-read-tools.test.mjs apps/mcp/test/owned-structure-read-tools.test.mjs apps/mcp/test/smoke.test.mjs apps/cli/test/smoke.test.mjs scripts/test-workspace-structure.mjs
node scripts/check-architecture.mjs
```

Mandatory root test list includes the2 new tests. Real flat-temp create/rename/delete,
abort, late/reentrant closure and actual native close confirmation pass; no exact OS
event count assumed. Managed SDK fixture uses an independent owned-file writer task
while the actual readonly Runtime query waits; generation changes and the old result
refuses. A bounded test timer covers both notification and metadata reconcile, and
always releases the read gate in finally. Normal managed/structure and old bootstrap
remain compatible. Only Windows local owned-temp behavior is observed here; a later
exact-head CI result, not a TypeScript portability assumption, supplies hosted evidence.

CI201 exactd9631d5 is terminal TS/Rust success. Complete Native log confirms R8
script catalog mismatch/D5_SCRIPT_PREREQUISITE_FAILED and skipped qualification;
no duplicate run or manual dispatch. That old head is not proof for new source.
Fresh temp directories/small test files are retained, no unrelated files moved/deleted.
Normal production CLI/Source project observation, user databases/data, scanning,
model/publication, Native/R9/numeric profile gates remain closed/open as before.
Phase1 stays4/21, A6 NOT_QUALIFIED, E02 PROPOSED/uninstalled. Disable additive adapter
to roll back; prior service paths and histories remain.
