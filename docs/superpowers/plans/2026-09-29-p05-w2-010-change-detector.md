# P05-W2-010 Change Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce deterministic added/modified/deleted selected-file changes from committed worktree state, including after restart, without claiming Canonical graph freshness.

**Architecture:** Add a pure classifier in `@codeatlas/application` that compares validated old and new SourceFile inventories. Reuse `reconcileGitWorktree`'s existing scan, stable IDs, and atomic `SourceStatePort.replace`; return the classified transition only after that replacement succeeds. Extend the existing registered restart Fixture rather than adding another storage authority.

**Tech Stack:** Node 24, TypeScript, existing `@codeatlas/ir` and `@codeatlas/source` packages, Node test runner, migrated `node:sqlite` repository database, version-1 Fixture manifest.

**Spec:** [Approved P05-W2-010 design](../specs/2026-09-29-p05-w2-010-change-detector-design.md)

## Global Constraints

- Preserve `SourceStatePort`, existing R001/R002/R008 SQL and migration checksums, and the current `changedPaths` result; add no database table, sidecar, Provider import, or IPC/Canonical IR field.
- Compare only selected `RepositoryRelativePath` entries and the existing analysis-relevant SourceFile fields; ignore timestamps and scan order. Keep all three arrays sorted and disjoint.
- Same-path modifications retain their SourceFile ID; rename is delete plus add, with no identity inference. Deletions carry the old ID and fingerprint; additions/modifications carry target-revision SourceFiles.
- `null` base means no REFRESH base. This task does not check or activate the graph; later REFRESH may use a delta only when the active indexed revision ID and fingerprint both equal its non-null base. Otherwise use explicit Full Analysis fallback.
- Keep local-only/security policy, source failure behavior, and transactional rollback unchanged. Add no watcher, non-Git adapter, Native REFRESH, graph patch, Knowledge feature, or numerical threshold.
- Record fresh executable evidence in `CURRENT_STATUS.md`; do not mark Phase 0.5 exit complete. Hosted CI is required before calling the task integrated.

## Review Focus

1. A path has equal bytes but changed language/classification/sensitivity: Task 1 tests that it is `modified`.
2. A deletion followed by re-add or a rename: Task 1 and Task 2 test delete/add classification without ID transfer.
3. Ignored/secret files change while selected files do not: Task 2 tests empty arrays and `changedPaths`.
4. Scan or compare-and-replace fails: Task 2 tests that no successful change result or persisted transition escapes.
5. Source state advances while the active graph fingerprint stays old, then the process restarts: Task 2 tests an empty next delta but an unchanged old indexed fingerprint; no current-graph or patch-authorization claim is made.

---

## File map

| Path | Responsibility |
| --- | --- |
| `packages/application/src/change-detector.ts` | Pure before/after classification and `WorktreeChangeSet` type; internal function, no Provider dependency. |
| `packages/application/test/change-detector.test.mjs` | Focused field-change, ordering, ID, empty, and rename-as-delete-add cases. |
| `packages/application/src/reconcile-worktree.ts` | Call classifier before `replace`, return its result only after commit, derive `changedPaths` from it. |
| `packages/application/src/index.ts` | Export the result type without adding a second use-case entry point. |
| `packages/application/test/reconcile-worktree.test.mjs` | Real Git/SQLite Fixture, restart, failure, and indexed-fingerprint staleness checks. |
| `fixtures/source/restart-reconciliation/{setup,expected}.json` | Pinned classified transitions, including a physical rename; retain existing expected path checks. |
| `package.json` | Register the new focused test in the root Node fileset. |
| `docs/handoff/{DESIGN_TRACEABILITY,CURRENT_STATUS}.md` | Map actual executable Fixture/tests and record fresh gates only after verification. |

### Task 1: Pure selected-file change classification

**Files:** Create `packages/application/src/change-detector.ts` and `packages/application/test/change-detector.test.mjs`; modify root `package.json` to register the new test. Do not edit storage, source scanner, or IR.

**Interfaces:** Consume `StoredWorktreeState` from `reconcile-worktree.ts` and `SourceFile`, `EntityId`, `ContentFingerprint`, `RepositoryRelativePath` from `@codeatlas/ir`. Produce `detectWorktreeChanges(previous: StoredWorktreeState | null, next: StoredWorktreeState): WorktreeChangeSet` with exactly the five fields in the approved spec. This helper is internal to the application package; the exported result type is wired in Task 2.

- [ ] **Step 1: Write the failing focused test.** In `change-detector.test.mjs`, construct valid `SourceFile` and `WorktreeRevision` values with IR schemas. Assert null baseline with files yields sorted additions and null baseline without files yields three empty arrays; same-path bytes, language hint, each classification field, or sensitivity change yields one modification with the retained ID; unchanged and differently ordered arrays yield no change; removal carries old ID/fingerprint; a new path plus removed path yields separate sorted add/delete even when bytes match. Assert all three outputs are disjoint.
- [ ] **Step 2: Run the RED test.** Run `node --test packages/application/test/change-detector.test.mjs`; expect an absent module/export or specific classification assertions to fail.
- [ ] **Step 3: Implement the pure classifier.** In `change-detector.ts`, define the spec's `WorktreeChangeSet` type and exact function signature above. Reuse the current `differs` comparison semantics from `reconcile-worktree.ts` in one place; iterate the union of validated paths in sorted order, classify by membership/field difference, and use the prior revision for both base fields. No filesystem, database, Provider, or graph calls.
- [ ] **Step 4: Run GREEN and regression checks.** Run `node_modules/.bin/tsc.cmd -p packages/application/tsconfig.json`, then `node --test packages/application/test/change-detector.test.mjs packages/application/test/reconcile-worktree.test.mjs`; expect all cases to pass, including the unchanged earlier Fixture.
- [ ] **Step 5: Commit the independently reviewable classifier.** Stage only Task 1 files, run `git diff --cached --check`, then `git commit -m "feat(application): classify worktree file changes"`.

### Task 2: Reconciliation result, restart Fixture, and acceptance evidence

**Files:** Modify `packages/application/src/reconcile-worktree.ts`, `packages/application/src/index.ts`, `packages/application/test/reconcile-worktree.test.mjs`, `fixtures/source/restart-reconciliation/setup.json`, `fixtures/source/restart-reconciliation/expected.json`, `docs/handoff/DESIGN_TRACEABILITY.md`, and `docs/handoff/CURRENT_STATUS.md`. Keep `fixture.json` unchanged unless its declared artifact paths change.

**Interfaces:** Consume Task 1's `detectWorktreeChanges` and `WorktreeChangeSet`. Extend `ReconcileWorktreeResult` with `readonly changes: WorktreeChangeSet`; preserve `revision`, `files`, and `changedPaths: readonly RepositoryRelativePath[]`. Export `WorktreeChangeSet` as a type from `packages/application/src/index.ts`. No new `SourceStatePort` method.

- [ ] **Step 1: Extend the declared Fixture and write failing integration assertions.** Extend `expected.json` with exact base/target fingerprints and ordered added/modified/deleted paths for initial, unchanged restart, edit/add/delete, second restart, re-add, and a physical rename; assert opaque-ID continuity/inequality in the test, since UUIDs are not golden values. Derive checked-in fingerprint goldens independently from Fixture bytes and the documented `codeatlas-worktree-v1` encoding, not by copying the detector's output. In the existing real Git + migrated SQLite test, assert `changedPaths` remains the sorted union, modified ID continuity, deletion's prior ID/fingerprint, rename's separate identities, and ignored/secret edits' invisibility. Reopen the database between declared restart transitions.
- [ ] **Step 2: Add failure and stale-graph assertions to the same test.** Preserve the existing scan and injected SQLite-write failure checks and assert neither yields a successful `changes` result or a changed stored fingerprint. After a successful source edit, retain a pre-edit `repository_state.indexed_content_fingerprint`, close/reopen, and assert the next source delta is empty while the indexed fingerprint still differs from current source; do not call this a current graph or a valid empty REFRESH.
- [ ] **Step 3: Run the RED integration test.** Run `node --test packages/application/test/reconcile-worktree.test.mjs`; expect the absent `changes` result or exact Fixture assertions to fail.
- [ ] **Step 4: Wire the classifier into reconciliation.** Build the existing validated `next: StoredWorktreeState`; compute `changes = detectWorktreeChanges(previous, next)` before `store.replace(previous, next)`; call `replace` once; return `changes` only on success and derive sorted `changedPaths` from its three path arrays. Remove the duplicate old `differs` logic. Export only the type through `index.ts`.
- [ ] **Step 5: Run focused GREEN checks.** Run `node_modules/.bin/tsc.cmd -p packages/application/tsconfig.json`, then `node --test packages/application/test/change-detector.test.mjs packages/application/test/reconcile-worktree.test.mjs packages/source/test/fingerprint.test.mjs packages/storage/test/source-state.test.mjs`; expect the registered Fixture and failure/recovery cases to pass.
- [ ] **Step 6: Run applicable whole-task gates.** Run `pnpm verify` (the root's declared format/build/test/architecture/Rust/Native suite). If its dependency preflight blocks before scripts, record that exact failure and run the installed `tsc.cmd` build/type checks, the `node --test` fileset named in the root `test` script, `node scripts/check-architecture.mjs`, `node_modules/.bin/prettier.cmd --check .`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, and the root `test:native-analysis` fileset directly. Run `git diff --check` separately. Report constituent outcomes without calling the wrapper passed. Do not invent a numerical performance threshold.
- [ ] **Step 7: Record evidence and commit.** Update P05-W2-010 in `DESIGN_TRACEABILITY.md` with exact Fixture/test paths and governing specs, and `CURRENT_STATUS.md` with commands, counts, failure/recovery evidence, schema impact, limitations, and Phase 0.5 open gates. Stage only Task 2 paths, run `git diff --cached --check`, then `git commit -m "feat(application): return classified restart-safe changes"`. Review/hosted CI and integration remain separate from a local completion claim.

## Self-review and handoff

The two tasks cover every contract, failure boundary, and Fixture in the approved spec. Task 1 can be reviewed without touching persisted state; Task 2 consumes only its pure interface. Neither task implements the P05-W1-011 Patch Apply design change or P05-W3-020 Native REFRESH. Do not begin either implementation task until the user reviews this plan and selects an execution method.
