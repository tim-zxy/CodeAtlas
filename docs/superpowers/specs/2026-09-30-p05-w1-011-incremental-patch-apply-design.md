# P05-W1-011 Incremental Patch Apply Design

Status: accepted by user on 2026-09-30, with the same-revision boundary amended by the accepted [cross-revision Design Change Proposal](2026-09-30-p05-w1-011-cross-revision-design-change-proposal.md). The implementation plan was approved for native inline execution.

## Intent and boundary

Complete the Phase 0.5 storage/application half of incremental indexing. Given a complete, validated Provider patch, update Canonical code facts, Evidence, bindings, and the indexed revision/fingerprint in one transaction. A failed, partial, corrupt, stale-base, or unrepresentable patch must leave the last committed graph and activation pointer unchanged. This task does not implement Rust `REFRESH`, file dependency selection, a watcher, graph query, or a new quality threshold. P05-W3-020 later produces real Native patches and proves incremental correctness.

The governing contracts are `WORK_BREAKDOWN.md` P05-W1-011, `PHASE_ACCEPTANCE.md`, `SQLITE_SCHEMA.md`, `CANONICAL_IR.md`, `PROVIDER_SPI.md`, `NATIVE_IPC.md`, `EVALUATION.md`, ADR-002/003/004/010/011/012/014/015, and the P05-W1-010 and P05-W4-002 accepted designs. Preserve Provider-independent Canonical IR, SQLite authority, Evidence history, the application-owned write boundary, strict IPC v1, and the existing FactMerger selection policy.

## Observed gap

R005 `provider_fact_bindings` records Provider Fact identity, snapshot, Canonical Fact ID, and Evidence ID, but not each support's normalized Canonical candidate. P05-W1-010 stages each `MergeSupport` in TEMP `analysis_support`, then persists only the selected Canonical row and support relations. `selectMergedGroup` ranks each original candidate's resolution/source range and uses each original confidence. If the selected support is removed, the remaining binding and merged Canonical row cannot reconstruct the remaining candidate's display fields, target candidates, or confidence. Guessing from the current row would violate the accepted FactMerger rule.

## Decision and alternatives

Add an application-private, validated per-support candidate table in repository migration R009. Persist each active support's normalized `CanonicalNode` or `CanonicalEdge` JSON, keyed by its Evidence ID and tied to its active binding. Full analysis writes these candidates from its existing staged supports; patch apply loads only affected support groups and calls the existing `selectMergedGroup` through a structural callback supplied by Runtime. Storage does not import the Provider package. It does not introduce a second scoring rule or expand public Canonical/Evidence IR.

Alternatives rejected:

1. Full reanalysis on every support removal: safe but does not satisfy incremental Patch Apply or the no-default-full-reparse gate.
2. Reconstruct a candidate from the merged row and binding: information was lost, so representative reselection and confidence can be wrong.
3. Persist raw Provider Facts and renormalize later: duplicates Provider payload/normalization version concerns and broadens storage scope.

This is an additive, compatible storage design change, not an override of ADR-002/003/010. Published R001–R008 SQL and checksums remain immutable. The *planned and unpublished* Phase 1 `execution_graph` and `runtime_flow` migrations shift from R009/R010 to R010/R011. The new R009 table is internal; no public IR or IPC version changes.

## R009 candidate contract and legacy state

`active_support_candidates` has one row per active Evidence ID: `evidence_id` primary key, `fact_type` (`NODE`/`EDGE`), `canonical_fact_id`, and strict-JSON `candidate_json`. A composite foreign key `(evidence_id, fact_type, canonical_fact_id)` references the corresponding `provider_fact_bindings` primary key with `ON DELETE CASCADE`. The application validates JSON with `CanonicalNodeSchema` or `CanonicalEdgeSchema` on write and read, and verifies its ID, revision, repository, type, and FactKey against the binding and affected group. The table contains normalized Canonical candidate fields only, not raw source text or Provider-native payload. Historical Evidence remains; retiring a binding removes its active candidate.

R009 creates an empty table for existing databases. It cannot reconstruct old nonselected support candidates. Before applying any patch, the store checks that every active binding on the active graph has exactly one valid candidate and every active Canonical fact has support. If this is false, it reports a controlled `FULL_ANALYSIS_REQUIRED` condition without mutation. A successful P05-W1-010 full analysis on R009 repopulates candidates and restores patch eligibility, including for a same-ID mutable `WORKTREE`. A genuinely empty, supported active graph is eligible; absence of candidates alone is not a legacy marker. An old binary opening R009 continues to follow the existing `DATABASE_TOO_NEW` policy. No down migration is attempted; rollback of deployment uses a pre-upgrade database backup.

## Validated patch and transaction

The Application command accepts an opaque staged patch plus repository ID, base revision ID/fingerprint, target revision ID/fingerprint, and a successful ProviderSnapshot for the target. A complete validated v1 `REFRESH` stream supplies typed Provider upserts/removals, coverage, diagnostics, terminal counts, and checksum. P05-W1-011 can use deterministic synthetic streams in Fixtures; it does not claim the Native executable implements `REFRESH`. A `PARTIAL`, failed, cancelled, malformed, truncated, or unvalidated stream is never applicable. A zero-event successful patch is permitted only with a valid terminal and matching target source state.

For Phase 0.5, patch activation is limited to the same mutable `WORKTREE` revision ID at base and target, with distinct base/target fingerprint checks. A different revision ID or immutable target is unrepresentable with changed facts alone: return controlled `FULL_ANALYSIS_REQUIRED` before mutation, without copying or relabeling old Evidence or candidates. This does not weaken the separately declared incremental-correctness and no-default-full-reparse gates on their pinned inputs.

Stage and normalize changed Provider Facts before any persistent write, using the P05-W4-001 identity rules. Resolve each removal against exactly one currently active Provider binding; duplicate/missing removal, duplicate upsert, contradictory remove/upsert, wrong Provider/snapshot/context, or unsupported operation fails the complete patch. Preserve unrelated Provider supports. The patch contract must explicitly identify all Provider facts removed or replaced; missing dependent removals are rejected by referential validation, not silently inferred from a file path. No Canonical Fact is deleted merely because one support is removed.

Immediately before mutation, open one `BEGIN IMMEDIATE` transaction and recheck: base and target IDs are the same mutable `WORKTREE` revision; the active indexed revision **and fingerprint** equal the patch base; the target `revisions` row has the requested target fingerprint; the Provider snapshot ID is new; and the candidate-coverage precondition holds. A base mismatch returns a controlled full-analysis fallback condition and leaves the old graph readable, possibly `STALE`; it never relabels a stale graph as current.

Within that same transaction, retire replaced/removed active bindings and links. An upsert replacing the same Provider Fact identity makes its old Evidence `SUPERSEDED`; an explicit remove with no replacement makes its old Evidence `INVALIDATED`. An upsert implicitly retires its previous active observation, so a simultaneous explicit remove of that same Provider Fact identity is invalid. Insert the new snapshot/Evidence/bindings/candidates. Recompute each affected `(repository, revision, fact type, FactKey)` group with the existing FactMerger selector. Replace its Canonical row with the selected real candidate, or remove it only when no active support remains. Order node/edge mutations to preserve foreign keys; reject a dangling source, resolved target, or unresolved candidate instead of silently dropping an edge. Check no active binding or FactEvidence points to an absent Canonical fact and no Canonical fact lacks active support. Write patch coverage/diagnostics and update both activation fields last. Any validation or SQL failure rolls back all graph, support, Evidence, snapshot, and pointer changes. Do not run one transaction per fact.

The storage operation is `applyAnalysisPatch(stage: RepositoryPatchStage, expected: ExpectedPatch): number`, where `ExpectedPatch` contains the repository ID, base and target revision IDs/fingerprints, and successful target `ProviderSnapshot`; the return is write-lock duration in milliseconds, matching full apply. The Application layer validates publication eligibility and calls this opaque store operation once. Historical Evidence rows retain identity and terminal status once retired. Patch application never publishes Knowledge or writes workspace SQLite.

## Boundedness and error behavior

Use the existing JSONL ceilings and TEMP-stage/backpressure pattern; iterate indexed support groups and SQL rows rather than loading the repository graph into one JavaScript array. Candidate JSON and patch events are bounded by existing IR/IPC limits. The store checks the base and source under its write lock, with a single activation transaction. Controlled failures distinguish invalid patch, base mismatch, incomplete legacy candidate state, and SQL failure without echoing source or rejected payload values. A process crash before COMMIT leaves the prior committed graph; a post-COMMIT caller retry with the old base fails safely rather than double-applying.

## Fixtures, evaluation, and acceptance

Register `p05-incremental-patch-apply-v1` under `fixtures/storage/` with exact cases for one-file node/edge add, modify, and delete; selected-support removal with a second Provider retaining the fact; last-support removal; representative/confidence/candidate change after reselection; stale/dangling binding rejection; same-`WORKTREE` target fingerprint change; zero-event success; old-base, changed-revision, immutable-target, and legacy-R009 fallback; duplicate/contradictory patch events; and injected failure after support retirement and immediately before pointer update. Reopen SQLite after failure and compare exact graph, Evidence, bindings, candidates, and both activation fields to the pre-patch image.

Reuse `two-provider-same-call`, `p05-full-analysis-apply-v1`, `p05-repository-activation-v1`, and `restart-reconciliation` as regression inputs. Compare recomputed groups with the pure FactMerger output, including Provider/event-order permutations. Run TypeScript build/type tests, root Node tests, storage migration/constraint tests, architecture check, formatting, and the applicable Native IPC v1 protocol Fixtures. P05-W9-001 later evaluates actual Native `REFRESH` against the declared 100% incremental-correctness and zero-stale-binding gates; no new numeric threshold is created here. Hosted CI and the reproducible task evidence are required before this task is marked integrated.

## Design change proposal and synchronization

- Changed decision: reserve R009 for active support candidates; move only unpublished Phase 1 R009/R010 names to R010/R011. Authority: normative `SQLITE_SCHEMA.md`, under FROZEN SQLite/IR/IPC ADR boundaries.
- Evidence: R005 binding columns and P05-W1-010 write path discard unselected candidates while P05-W4-002 selection needs them after support removal.
- Compatibility/migration: additive R009 table, immutable prior SQL/checksums, legacy full-analysis fallback; no Canonical IR, Evidence IR, ProviderSnapshot, or IPC wire change. Old binaries reject newer schema under existing policy.
- Security: validated Canonical candidate JSON only, local repository database, no source-text cache or new network path.
- Phases: Phase 0.5 patch/full-apply compatibility and planned Phase 1 migration numbering only. No deferred capability moves earlier.
- Synchronize on approval: `SQLITE_SCHEMA.md`, `ROADMAP.md`, `WORK_BREAKDOWN.md`, `PHASE_ACCEPTANCE.md`, `DESIGN_TRACEABILITY.md`, `EVALUATION.md`, `CURRENT_STATUS.md`, migration manifest/Fixture inventory, and P05-W1-010 full-apply documentation as implementation makes the candidate write path real. Record this proposal as accepted before changing migration files or product code.
- Rollback: preserve pre-R009 backup; never infer missing candidates or lower a gate to make a patch pass.

The user accepted this written design and additive design-change proposal on 2026-09-30. Implementation still requires a reviewed plan and synchronized governing documents before product-code or migration changes.
