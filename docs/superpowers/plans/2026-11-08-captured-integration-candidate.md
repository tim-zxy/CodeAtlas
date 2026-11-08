# Captured Integration implementation plan

> For agentic workers: separate file ownership; single final integrator.

**Goal:** Preserve authoritative service bindings and derive bounded Integration
candidates from captured matched contracts without model/publication.
**Architecture:** Existing private capture DTO extension, Runtime owned view,
Application pure candidate generation. Original legacy representation preserved.
**Tech stack:** Existing TypeScript/IR/Node tests, no dependencies.
**Spec:** ../specs/2026-11-08-captured-integration-candidate.md

## Review focus
Legacy digest compatibility; cross-revision/foreign bindings; support-only closure;
selection pruning; nonmatched/duplicate participants; bounded/cancelled work.

## Integrated batch
- [x] Capture agent owns IR contract, Runtime adapter and associated existing tests.
- [x] Candidate agent owns new private Application generator and its tests.
- [x] Integrator registers the new mandatory test, builds IR/Application/Runtime
  in dependency order and runs the affected capture/candidate/persistence suites.
- [x] Independent review final data/authority boundaries, fix related issues only;
  update status/trace and approved capture authority, exact-stage and sync once.

No Native build/R9/user databases/scanning/model or publishing. Existing CI177
finished TS/Rust success, Native oldR8 catalog failure; no retrigger.

## Reproducible verification

Fixed Node24.15.0; build using `node node_modules/typescript/bin/tsc -p` with
packages/ir, packages/application and packages/runtime tsconfig.json in dependency
order. Agent capture suites: application compilation-input-contract43/43 and
runtime compilation-input14/14. Integrator command:

`node --test --test-concurrency=1 packages/application/test/integration-candidate.test.mjs packages/application/test/compilation-input.test.mjs packages/application/test/semantic-test-invocation.test.mjs packages/storage/test/compilation-input-store.test.mjs packages/storage/test/workspace-compilation-input.test.mjs scripts/test-workspace-structure.mjs`

Result106/106, no failures/skips. Independent review fixes verified by associated
read-only recheck;8 candidate tests included, not additional to106. Initial capture
focused run2fail/1pass preceded implementation; candidate initial5pass/2fail were
fixture selection errors, corrected by explicitly selecting all intended entities,
not product relaxation. Architecture17 and changed-file formatting/diff checks.

Remaining production clearance, full lifecycle/W011, stable Component refs and
Native qualification remain separately governed; no stage acceptance claim.
