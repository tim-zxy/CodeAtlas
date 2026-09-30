# P05-W1-011 Cross-Revision Patch Support — Design Change Proposal

Status: **Accepted by user on 2026-09-30** for the Phase 0.5 P05-W1-011 implementation. This amends the patch applicability boundary, not FROZEN Canonical IR, Evidence, or IPC contracts.

## Conflict found during implementation

The accepted P05-W1-011 patch API names separate base and target revision IDs and requires preservation of unrelated Provider supports. The current Evidence contract makes an Evidence ID and its `revisionId` immutable. R005 stores each active Evidence with one `revision_id`; R009 candidates are keyed to those active bindings; Canonical nodes and edges are keyed by `(revision_id, id)` and edge references must resolve within that revision. A patch stream contains only changed Provider facts, not a complete new observation of the unchanged ones.

For `targetRevisionId != baseRevisionId`, moving the active graph to the target while retaining untouched supports would require either relabeling historical Evidence/candidates with a different revision, inventing new Evidence without a Provider observation, or leaving active facts/support on the base revision while publishing the target pointer. Each conflicts with existing identity, evidence, or freshness invariants. The accepted design does not specify a lawful carry-forward representation. This is not a migration or test-fixture defect.

## Accepted Phase 0.5 ruling

Apply incremental patches only when `targetRevisionId == baseRevisionId` and the target is the same mutable `WORKTREE` revision with a separately verified target fingerprint. Reject a changed revision ID or non-`WORKTREE` target before mutation with a controlled `FULL_ANALYSIS_REQUIRED` fallback. Keep the existing last graph and activation pointer unchanged. This is not a claim that a different-revision patch is valid or that the eventual no-default-full-reparse acceptance is met. Preserve the current API fields so a later approved design can extend behavior without an IPC change.

Synchronize the P05-W1-011 design, plan, WORK_BREAKDOWN, PHASE_ACCEPTANCE, DESIGN_TRACEABILITY, EVALUATION, Fixture manifest, and CURRENT_STATUS. Add explicit different-revision and immutable-target fallback/rollback Fixture and evaluation cases. Do not alter R001–R009, Canonical IR, Evidence transition, or Native IPC v1.

## Alternative requiring further design

Support changed revision IDs in Phase 0.5 by defining an explicit, evidence-preserving carry-forward operation and its Provider authority, candidate identity, failure recovery, and migration semantics. This requires an accepted ADR/Design Change plus new Fixtures before implementation. Simply copying or relabeling old Evidence is not acceptable.

## Governance and impact

- Authority class: this narrows one approved Phase 0.5 patch design without changing the FROZEN identity/evidence/SQLite/IPC decisions. Broader cross-revision support remains a separate governed design question.
- Evidence: R004 graph rows use `(revision_id, id)` and same-revision edge foreign keys; R005 Evidence and ProviderSnapshot bind to one revision; `EvidenceSchema` forbids revision changes; R009 candidates depend on those bindings. The changed-facts-only REFRESH stream has no unchanged-support carry-forward event.
- Compatibility and migration: request/expected fields remain; no wire or schema change, migration, or backfill. Different-revision attempts fail closed with the old graph intact.
- Security and lifecycle: no new source cache, network path, Provider authority, direct SQLite writer, or publication route. Validation precedes activation and reports a controlled fallback without raw payloads.
- Phase and evaluation: P05-W1-011 proves same-WORKTREE-ID patches and explicit fallback. P05-W3-020/P05-W9-001 retain their declared incremental-correctness and no-default-full-reparse gates on pinned inputs; a broader changed-revision claim requires a reviewed design and Fixtures.
- Rollback: revert this unintegrated implementation branch if needed; databases remain R009-compatible and the last committed graph is retained on rejection. No down migration is introduced.
