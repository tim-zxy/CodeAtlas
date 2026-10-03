# SQLite Schema and Migration Specification

Packet B local final validation (2026-10-02): real full-bootstrap/reopen/rollback and bounded state-read gates pass under the approved exact static profile. R010 remains version10/native_analysis_state/backupRequired false, LF-normalized checksum `sha256:ebf26d1df42a47418bb06173e4783d3fdf3503ca0f6e0a0f8b6893ebbc711fa2`; no migration, graph publication transaction or Canonical contract changes in the review correction. R001–R009 remain immutable. Current local gates and unavailable hosted evidence are recorded in CURRENT_STATUS; real REFRESH summary-patch activation remains later work.

Packet B execution update (2026-10-02): Task 6 is locally committed as `0b2af73`, with 24 real bootstrap/lifecycle cases, 98/98 expanded focused tests and root 796 pass/0 fail/one existing Windows skip. Task 7 now advertises full v3 `[1,2,3]` after observed RED→GREEN descriptor tests; strict v1/v2, IR v1, capability list and explicit v3 REFRESH refusal are unchanged. The required bootstrap runner obtains the actual descriptor through the production client rather than using a future descriptor. Native integration CI selects Windows/x64 Node 24.15.0 because only that exact environment has reviewed full-transport admission; Ubuntu TypeScript and Windows Rust gates remain. This is configured coverage, not observed hosted CI or Linux bootstrap evidence. Final Task 7 gates/review remain pending; earlier unimplemented/profile-review-blocked wording is historical. Parent REFRESH and original Phase 0.5 exits stay open at 10/14 integrated, with no new milestone or deferred scope.

## Topology and rules

Use one rebuildable repository database per repository and one workspace database per workspace. Use parameterized SQL and focused repositories, not an ORM. WAL/busy-timeout choices are configuration concerns; transaction ownership is centralized. Published migration files are immutable; fixes use new migrations.

```ts
interface TransactionRunner {
  run<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T>;
}
interface CanonicalFactStore {
  applyAnalysisBatch(batch: ValidatedAnalysisBatch): Promise<void>;
  applyAnalysisPatch(patch: ValidatedAnalysisPatch): Promise<void>;
  getProviderBindings(fact: EntityRef): Promise<ProviderFactBinding[]>;
}
```

## Repository migrations

| Migration                                        | Phase | Principal tables                                                                           |
| ------------------------------------------------ | ----: | ------------------------------------------------------------------------------------------ |
| R001 repo_core                                   |     0 | repository, repository_state                                                               |
| R002 source_revision                             |     0 | revisions, source_files                                                                    |
| R003 provider_runtime                            |     0 | provider_snapshots, provider_capabilities                                                  |
| R004 code_graph                                  |     0 | canonical_nodes, canonical_edges, unresolved_targets                                       |
| R005 evidence                                    |     0 | evidence, fact_evidence, provider_fact_bindings                                            |
| R006 analysis_coverage                           |     0 | analysis_coverage                                                                          |
| R007 diagnostics                                 |     0 | analysis_diagnostics                                                                       |
| R008 indexed_fingerprint                         |   0.5 | repository_state indexed_content_fingerprint                                               |
| R009 active_support_candidates                   |   0.5 | active_support_candidates                                                                  |
| R010 native_analysis_state (implemented locally) |   0.5 | native_analysis_state, native_analysis_file; empty derived tables without guessed backfill |
| R011 execution_graph                             |     1 | execution_nodes, execution_edges, execution_contexts                                       |
| R012 runtime_flow                                |     1 | runtime_flows, runtime_flow_steps                                                          |

R001-R007 are the Phase 0 repository schema. `repository` is a single stable-ID row per database; `root_path` is a locator, not identity. Revisions retain kind-specific identity and fingerprints; a source-file ID may recur across revisions, while `(revision_id, path)` is unique. Provider snapshots retain requested revision/fingerprint and outcome, including partial or failed observations. Canonical node/edge IDs and FactKeys are Provider-independent and unique within a revision. Resolved edges reference same-revision nodes; unresolved edges retain their resolution and a separate hint/candidate array without selecting a target. Evidence and Provider bindings are separate from Canonical Facts. Coverage and bounded diagnostics belong to Provider snapshots. The exact column mapping and deliberate application-validation boundary are recorded in [`P0-W1-006 Repository Database Design`](../../superpowers/specs/2026-09-21-p0-w1-006-repository-db-design.md).

The repository manifest contains seven immutable, checksummed SQL files, `001_repo_core.sql` through `007_diagnostics.sql`. It remains independently versioned from the W001-W003 workspace manifest. The P0-W1-006 Fixture `p0-repository-schema-v1` at `fixtures/storage/repository-schema/cases.json` covers fresh-to-latest, all seven sequential upgrade boundaries, rerun safety, exact Phase 0 table/index inventory, representative relational constraints, and repository/workspace isolation. Full analysis activation, Fact Merge, and validated graph writes are later tasks; R001-R007 create structure only.

Critical indexes cover normalized source path, revision/fingerprint, node canonical key/kind, edge source/target/kind, unresolved hints, provider snapshot, evidence source/status, binding provider fact, coverage capability, diagnostics run, and runtime-flow ordinal.

`repository_state.indexed_revision_id` points only to a successfully activated graph. Failed snapshots remain diagnostic history but never become active.

P05-W1-010 adds R008 as an additive repository migration. `repository_state.indexed_content_fingerprint` records the fingerprint activated with `indexed_revision_id` in the same full-analysis transaction. A pre-R008 database may have a non-null indexed revision but no provable active fingerprint; migration leaves the new field null, preserves the graph, and reports freshness as `UNKNOWN` until a successful full analysis replaces both activation values. New validated writes set both fields together. Matching only a mutable `WORKTREE` revision ID cannot prove freshness. At the time of R008, the planned, unpublished Phase 1 repository migrations moved to R009/R010; P05-W1-011 subsequently reserves R009 as stated below. Published R001-R007 SQL and checksums remain unchanged. See the [P05-W1-010 design](../../superpowers/specs/2026-09-29-p05-w1-010-full-analysis-apply-design.md).

P05-W1-011 adds R009 to retain one schema-validated normalized Canonical candidate per active Evidence/Binding. This allows exact FactMerger reselection after one Provider support is removed without storing raw Provider facts. R009 does not backfill unselected candidates in older graphs: patch apply requires a successful new full analysis first and otherwise returns `FULL_ANALYSIS_REQUIRED` without mutation. Published R001-R008 remain immutable; the unpublished Phase 1 repository reservations move to R010/R011. The [accepted P05-W1-011 design](../../superpowers/specs/2026-09-30-p05-w1-011-incremental-patch-apply-design.md) governs the candidate table, fallback, and atomic patch boundary.

The accepted [cross-revision amendment](../../superpowers/specs/2026-09-30-p05-w1-011-cross-revision-design-change-proposal.md) changes no schema: Phase 0.5 patch activation requires one mutable `WORKTREE` revision ID. A different base/target ID or immutable target returns `FULL_ANALYSIS_REQUIRED` before mutation. Old Evidence and R009 candidates are never copied or relabeled to claim support for a new revision.

[ADR-016](../adr/ADR-016-native-refresh-derived-analysis-state.md) reserves additive R010 and moves the unpublished Phase 1 reservations to R011/R012; prior reservation descriptions above are historical. No R010 SQL/manifest is released by design approval. Derived summaries are TypeScript-owned, bounded, versioned and rebuildable; migration must not backfill guessed extraction metadata. Full/patch Apply activates compatible summaries with graph/support/Evidence/coverage/indexed fingerprint in one Store transaction. Legacy/missing/incompatible state requires explicit bootstrap without graph mutation; full writes without valid summaries make the summary baseline unavailable. The exact physical schema and failure/upgrade Fixtures require the next reviewed storage/bootstrap packet. Published R001-R009 SQL/checksums stay unchanged.

The [accepted P05-W3-020-B design](../../superpowers/specs/2026-10-01-p05-w3-020-state-bootstrap-design.md) and [native execution plan](../../superpowers/plans/2026-10-01-p05-w3-020-state-bootstrap.md) govern R010. Task 1 implements the two STRICT derived tables locally with normalized checksum `sha256:ebf26d1df42a47418bb06173e4783d3fdf3503ca0f6e0a0f8b6893ebbc711fa2`, no backfill and no source inventory FK. Prior reservation-only language above is historical. R001-R009 remain unchanged. Provider validation, bounded reads/staging, full bootstrap and transactional legacy invalidation remain later tasks; SQL `json_valid` alone is not authority to reuse or publish opaque summaries.

## Workspace migrations

| Migration                | Phase | Principal tables                                            |
| ------------------------ | ----: | ----------------------------------------------------------- |
| W001 workspace_core      |     0 | workspace                                                   |
| W002 repositories        |     0 | repositories                                                |
| W003 revision_sets       |     0 | revision_sets, revision_set_items                           |
| W004 services            |     1 | services, service_identities                                |
| W005 contracts           |     1 | contracts, contract_matches, contract_match_candidates      |
| W006 workspace_execution |     1 | workspace_execution_nodes, workspace_execution_edges        |
| W007 documents           |     1 | documents, document_revisions, sections, blocks, links      |
| W008 claims              |     1 | claims, claim_evidence                                      |
| W009 knowledge           |     1 | knowledge_items, knowledge_revisions, knowledge_relations   |
| W010 lifecycle           |     1 | source_changes, impacts, compilation_runs, publication_runs |
| W011 evaluation          |     1 | evaluation_runs, metrics, probe_results                     |
| W012 usage               |     2 | usage_events, feedback_events                               |

Phase 0 must not pre-create Phase 1 knowledge tables. Revision sets reject mutation after `frozen = 1`.
W001-W003 are the Phase 0 workspace schema. `workspace` is a single stable-ID row per database; root paths are locators rather than identity. `repositories` registers stable repository IDs without copying repository facts or creating cross-database foreign keys. A `revision_set` selects at most one revision ID and fingerprint per registered repository. The exact mapping and freeze safeguards are recorded in [`P0-W1-007 Workspace Database Design`](../../superpowers/specs/2026-09-21-p0-w1-007-workspace-db-design.md).

A RevisionSet may change while `frozen = 0`. Transition to `frozen = 1` is irreversible; SQLite triggers reject subsequent parent updates/deletes and item inserts/updates/deletes. The P0-W1-007 Fixture `p0-workspace-schema-v1` at `fixtures/storage/workspace-schema/cases.json` covers fresh-to-latest, all three sequential boundaries, exact table/trigger inventory, constraints/database isolation, and frozen-set immutability. Knowledge compilation remains a Phase 1 Application workflow and is not implemented by these migrations.

## Migration mechanics

The storage package owns SQLite connections and separate `REPOSITORY` and `WORKSPACE` migration manifests. Each manifest is schema version `1` with exactly `schemaVersion`, `databaseKind`, and ordered `migrations`. Each entry has exactly `version`, `name`, `file`, `checksum`, and `backupRequired`. Versions are unique safe positive integers, ordered contiguously from `1`; names and files are unique. Files use safe relative POSIX paths contained by the manifest directory, including after symlink resolution. A kind mismatch is rejected. P0-W1-006 populates the repository manifest with R001-R007; P0-W1-007 independently populates the workspace manifest with W001-W003.

The loader validates every entry and reads every SQL file before opening a transaction. Files are strict UTF-8 without BOM; CRLF and CR normalize to LF, with all other content preserved. SHA-256 is compared against the lowercase `sha256:<64 hex>` value after normalization. Published files and checksums are immutable; a correction is a new migration. Any malformed manifest, unreadable file, or checksum mismatch fails before mutation.

The Node 24 `node:sqlite` runner reads `PRAGMA user_version`, rejects invalid or newer-than-plan versions, and applies each pending migration in its own `BEGIN IMMEDIATE` transaction. It re-reads the version under the write lock so a concurrent advance is not replayed. Migration SQL cannot control transactions or write `user_version`; the runner updates `user_version` only after SQL succeeds and verifies it before commit. Failure rolls back only the current transaction and closes the connection; prior committed versions remain available. Reruns apply only pending versions. A pending `backupRequired: true` entry is rejected before mutation until backup orchestration is available; the runner does not silently back up.

The closed storage error family is `MIGRATION_MANIFEST_INVALID`, `MIGRATION_DATABASE_KIND_MISMATCH`, `MIGRATION_FILE_INVALID`, `MIGRATION_CHECKSUM_MISMATCH`, `MIGRATION_BACKUP_REQUIRED`, `DATABASE_VERSION_INVALID`, `DATABASE_TOO_NEW`, `MIGRATION_LOCKED`, `MIGRATION_VERSION_CHANGED`, `MIGRATION_TRANSACTION_ESCAPED`, and `MIGRATION_FAILED`. No raw SQL is included in public error messages. `fixtures/storage/migrations/cases.json` (`p0-migration-runner-v1`) covers empty, sequential upgrade, failed migration, and too-new scenarios, with locking, checksum, transaction-control, and rerun assertions in the storage tests.

P0-W1-006 and P0-W1-007 separately verify repository and workspace fresh-to-latest and every sequential boundary in real temporary databases. Later storage/application tasks retain ownership of cross-database lifecycle integration; neither schema task claims graph activation or knowledge compilation.

## Atomic update semantics

Full analysis writes staging state, validates it, then atomically activates the new indexed revision. Incremental updates validate a complete patch, apply it in one transaction, recompute provider support, and activate only on success. Evidence is invalidated/superseded rather than erased when historical provenance matters.

## Derived indexes

FTS5 tables and any Zvec indexes are rebuildable from canonical rows. Vector records include entity ID/revision, content hash, and embedding profile ID. An embedding-profile change dirties only the vector index.
