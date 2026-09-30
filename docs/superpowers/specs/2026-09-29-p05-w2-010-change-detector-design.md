# P05-W2-010 Change Detector Design

Date: 2026-09-29

Task: P05-W2-010

Status: approved by user on 2026-09-29; implementation awaits plan review

## Purpose and authority

Classify selected Git-worktree source changes from the last committed repository observation, including across process restart, so P05-W3-020 can request a file-level Native REFRESH without guessing from timestamps or reparsing unchanged files by default. Success is a deterministic, validated added/modified/deleted change set; a rename is delete plus add in Phase 0.5. The detector does not apply graph patches or claim that the active graph is current.

`WORK_BREAKDOWN.md` P05-W2-010, `PHASE_ACCEPTANCE.md` Phase 0.5 incremental/restart gates, `DESIGN_TRACEABILITY.md`, `CANONICAL_IR.md`, `RUNTIME_CONFIGURATION.md`, `NATIVE_IPC.md`, `SQLITE_SCHEMA.md`, and `EVALUATION.md` govern this design, together with ADR-001/002/003/004/012. It extends the accepted [P05-W2-002 fingerprint design](2026-09-24-p05-w2-002-file-worktree-fingerprints-design.md), not the published IR or IPC schemas. No new numerical threshold or FROZEN decision is proposed.

## Existing path and options

`observeGitWorktree` selects and fingerprints files; `RepositorySourceStateStore.load` returns the last committed mutable `WORKTREE` revision and SourceFiles; `reconcileGitWorktree` allocates/reuses IDs, computes sorted `changedPaths`, and atomically replaces that source state. The stored state survives restart. It has no classified change set yet.

Three approaches were considered:

1. **Extend the existing reconciliation result (chosen).** Classify the same before/after SourceFiles already compared by `reconcileGitWorktree`, before its existing atomic replace. This reuses scanning, identity, and concurrency safeguards with no new database table or second authority.
2. Diff a fresh observation against an in-memory cache. This cannot prove restart behavior and risks losing deletions; rejected.
3. Add a change-log table or watcher. That adds persistence and runtime machinery before a measured need, and a watcher cannot replace startup reconciliation; deferred.

## Contract and data flow

The application package adds a pure `detectWorktreeChanges(previous: StoredWorktreeState | null, next: StoredWorktreeState): WorktreeChangeSet` function, called by `reconcileGitWorktree` after constructing the validated next state and before `SourceStatePort.replace`. The reconciliation result gains its provider-neutral `changes` value with sorted, disjoint arrays:

```ts
interface WorktreeChangeSet {
  readonly baseRevisionId: EntityId | null;
  readonly baseContentFingerprint: ContentFingerprint | null;
  readonly added: readonly SourceFile[];
  readonly modified: readonly SourceFile[];
  readonly deleted: readonly {
    id: EntityId;
    path: RepositoryRelativePath;
    previousContentFingerprint: ContentFingerprint;
  }[];
}
```

`added` and `modified` carry validated target-revision SourceFiles, including their persistent path IDs; `deleted` carries the prior ID, path, and content fingerprint. The base fields come from the state loaded before observation and replace; `null` means no committed baseline and therefore no REFRESH base. The target is the existing `ReconcileWorktreeResult.revision`; `changedPaths` remains the sorted union of the three arrays for current callers. Each array sorts by repository-relative path. The change set contains no source bytes, absolute paths, Provider IDs, Canonical facts, or SQL details. P05-W3-020 may map it into strict v1 REFRESH input, but P05-W2-010 does not import the Provider package or construct a Native request.

Classification uses selected paths only. A path absent before and present after is `added`; present before and absent after is `deleted`; present on both sides is `modified` if content fingerprint, language hint, role, provenance, content kind, or sensitivity differs. Unchanged paths are omitted even if scan order or metadata timestamps change. File ID remains stable for an in-place modification; rename has no identity inference and appears once in `deleted` and once in `added`. An empty initial inventory yields three empty arrays; an initial nonempty inventory yields additions but no usable REFRESH base.

The source observation and classification finish before the existing `SourceStatePort.replace` call. A scan, validation, or stale-baseline write failure returns no successful result and preserves the prior persisted source state. No new transaction or migration is required. The result describes a successfully committed source transition, not an activated graph transition.

## Active-graph safety and recovery boundary

The current source observation may advance while the active Canonical graph remains at an older indexed fingerprint. Therefore an empty change set is **not** proof that the active graph is fresh. A future REFRESH coordinator may apply this delta only if both its active indexed revision ID and indexed content fingerprint match the change set's non-null base revision ID and base content fingerprint. An absent/legacy-unknown activation, a mismatch, or a lost delta after process restart requires an explicit Full Analysis fallback before marking the graph current. A valid delta is never reconstructed from only the latest source observation when the graph's baseline differs. This design records that precondition for P05-W3-020; P05-W2-010 neither changes graph activation nor implements the fallback coordinator.

The base check belongs to the validated application/storage patch workflow. If a future implementation cannot compare and activate atomically against that base, P05-W1-011 must resolve it through its own reviewed design; the detector must not weaken the check or infer freshness from the stable `WORKTREE` ID alone. The P05-W1-011 per-support payload persistence gap remains a separate design-change item, not part of this task.

## Fixture, tests, and acceptance

Extend the registered `restart-reconciliation` Fixture's declared expected artifact with exact classified additions, modifications, deletions, base/target fingerprints, and `changedPaths` for the existing initial, unchanged restart, edit/add/delete, second restart, and re-add steps. Add an actual rename-as-delete-plus-add transition. Keep the previous expected path assertions intact. Use a real Git repository and closed/reopened migrated SQLite database, as the existing test does; no mock-only restart proof. A focused pure-function test supplies valid before/after SourceFiles with equal content fingerprints but different classification or language hint and requires `modified`.

Focused tests verify ordering and disjointness, stable IDs for modification, old ID/fingerprint on deletion, ignored-file invisibility, empty inventory, and no returned transition after scan or transactional write failure. A recovery test must show that source state can be unchanged after restart while an indexed fingerprint remains older; the detector does not report graph freshness or authorize an empty patch. P05-W3-020 owns the executable REFRESH base-check/fallback test. P05-W9-001 owns end-to-end incremental correctness at the existing 100% declared-fixture gate and zero stale bindings; neither gate is diluted by this task.

Run the focused application/source/storage Fixture tests, applicable TypeScript build and root test checks, architecture guardrail, and formatting checks. Record commands and results in `CURRENT_STATUS.md`, update the P05-W2-010 traceability row with the exact executable Fixture and test paths, and keep Phase 0.5 exit unchecked until its independent gates pass. Hosted CI must pass before integration is called complete.

## Scope and change control

No watcher, non-Git adapter, Native REFRESH implementation, parser cache, graph patch, SQLite schema migration, Canonical IR/IPC version change, Knowledge capability, or new performance threshold is introduced. The existing `changedPaths` API is preserved. If a Fixture reveals that persisted R002 state cannot support correct before/after classification, stop for a governed design change instead of altering a published migration or inventing a sidecar. EVOLVABLE optimization requires pinned Evaluation evidence and synchronized design documents.
