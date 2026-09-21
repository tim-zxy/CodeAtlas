# SQLite Schema and Migration Specification

## Topology and rules

Use one rebuildable repository database per repository and one workspace database per workspace. Use parameterized SQL and focused repositories, not an ORM. WAL/busy-timeout choices are configuration concerns; transaction ownership is centralized. Published migration files are immutable; fixes use new migrations.

```ts
interface TransactionRunner { run<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T>; }
interface CanonicalFactStore {
  applyAnalysisBatch(batch: ValidatedAnalysisBatch): Promise<void>;
  applyAnalysisPatch(patch: ValidatedAnalysisPatch): Promise<void>;
  getProviderBindings(fact: EntityRef): Promise<ProviderFactBinding[]>;
}
```

## Repository migrations

| Migration | Phase | Principal tables |
|---|---:|---|
| R001 repo_core | 0 | repository, repository_state |
| R002 source_revision | 0 | revisions, source_files |
| R003 provider_runtime | 0 | provider_snapshots, provider_capabilities |
| R004 code_graph | 0 | canonical_nodes, canonical_edges, unresolved_targets |
| R005 evidence | 0 | evidence, fact_evidence, provider_fact_bindings |
| R006 analysis_coverage | 0 | analysis_coverage |
| R007 diagnostics | 0 | analysis_diagnostics |
| R008 execution_graph | 1 | execution_nodes, execution_edges, execution_contexts |
| R009 runtime_flow | 1 | runtime_flows, runtime_flow_steps |

R001-R007 are the Phase 0 repository schema. `repository` is a single stable-ID row per database; `root_path` is a locator, not identity. Revisions retain kind-specific identity and fingerprints; a source-file ID may recur across revisions, while `(revision_id, path)` is unique. Provider snapshots retain requested revision/fingerprint and outcome, including partial or failed observations. Canonical node/edge IDs and FactKeys are Provider-independent and unique within a revision. Resolved edges reference same-revision nodes; unresolved edges retain their resolution and a separate hint/candidate array without selecting a target. Evidence and Provider bindings are separate from Canonical Facts. Coverage and bounded diagnostics belong to Provider snapshots. The exact column mapping and deliberate application-validation boundary are recorded in [`P0-W1-006 Repository Database Design`](../../superpowers/specs/2026-09-21-p0-w1-006-repository-db-design.md).

The repository manifest contains seven immutable, checksummed SQL files, `001_repo_core.sql` through `007_diagnostics.sql`. The workspace manifest remains empty until P0-W1-007. The P0-W1-006 Fixture `p0-repository-schema-v1` at `fixtures/storage/repository-schema/cases.json` covers fresh-to-latest, all seven sequential upgrade boundaries, rerun safety, exact Phase 0 table/index inventory, representative relational constraints, and repository/workspace isolation. Full analysis activation, Fact Merge, and validated graph writes are later tasks; R001-R007 create structure only.

Critical indexes cover normalized source path, revision/fingerprint, node canonical key/kind, edge source/target/kind, unresolved hints, provider snapshot, evidence source/status, binding provider fact, coverage capability, diagnostics run, and runtime-flow ordinal.

`repository_state.indexed_revision_id` points only to a successfully activated graph. Failed snapshots remain diagnostic history but never become active.

## Workspace migrations

| Migration | Phase | Principal tables |
|---|---:|---|
| W001 workspace_core | 0 | workspace |
| W002 repositories | 0 | repositories |
| W003 revision_sets | 0 | revision_sets, revision_set_items |
| W004 services | 1 | services, service_identities |
| W005 contracts | 1 | contracts, contract_matches, contract_match_candidates |
| W006 workspace_execution | 1 | workspace_execution_nodes, workspace_execution_edges |
| W007 documents | 1 | documents, document_revisions, sections, blocks, links |
| W008 claims | 1 | claims, claim_evidence |
| W009 knowledge | 1 | knowledge_items, knowledge_revisions, knowledge_relations |
| W010 lifecycle | 1 | source_changes, impacts, compilation_runs, publication_runs |
| W011 evaluation | 1 | evaluation_runs, metrics, probe_results |
| W012 usage | 2 | usage_events, feedback_events |

Phase 0 must not pre-create Phase 1 knowledge tables. Revision sets reject mutation after `frozen = 1`.

## Migration mechanics

The storage package owns SQLite connections and separate `REPOSITORY` and `WORKSPACE` migration manifests. Each manifest is schema version `1` with exactly `schemaVersion`, `databaseKind`, and ordered `migrations`. Each entry has exactly `version`, `name`, `file`, `checksum`, and `backupRequired`. Versions are unique safe positive integers, ordered contiguously from `1`; names and files are unique. Files use safe relative POSIX paths contained by the manifest directory, including after symlink resolution. A kind mismatch is rejected. P0-W1-005 created empty manifests; P0-W1-006 populates only the repository manifest with R001-R007. The workspace manifest remains empty pending P0-W1-007.

The loader validates every entry and reads every SQL file before opening a transaction. Files are strict UTF-8 without BOM; CRLF and CR normalize to LF, with all other content preserved. SHA-256 is compared against the lowercase `sha256:<64 hex>` value after normalization. Published files and checksums are immutable; a correction is a new migration. Any malformed manifest, unreadable file, or checksum mismatch fails before mutation.

The Node 24 `node:sqlite` runner reads `PRAGMA user_version`, rejects invalid or newer-than-plan versions, and applies each pending migration in its own `BEGIN IMMEDIATE` transaction. It re-reads the version under the write lock so a concurrent advance is not replayed. Migration SQL cannot control transactions or write `user_version`; the runner updates `user_version` only after SQL succeeds and verifies it before commit. Failure rolls back only the current transaction and closes the connection; prior committed versions remain available. Reruns apply only pending versions. A pending `backupRequired: true` entry is rejected before mutation until backup orchestration is available; the runner does not silently back up.

The closed storage error family is `MIGRATION_MANIFEST_INVALID`, `MIGRATION_DATABASE_KIND_MISMATCH`, `MIGRATION_FILE_INVALID`, `MIGRATION_CHECKSUM_MISMATCH`, `MIGRATION_BACKUP_REQUIRED`, `DATABASE_VERSION_INVALID`, `DATABASE_TOO_NEW`, `MIGRATION_LOCKED`, `MIGRATION_VERSION_CHANGED`, `MIGRATION_TRANSACTION_ESCAPED`, and `MIGRATION_FAILED`. No raw SQL is included in public error messages. `fixtures/storage/migrations/cases.json` (`p0-migration-runner-v1`) covers empty, sequential upgrade, failed migration, and too-new scenarios, with locking, checksum, transaction-control, and rerun assertions in the storage tests.

P0-W1-006 verifies repository fresh-to-latest and every sequential boundary in real temporary databases. Independent repository DB rebuild and workspace continuity remain integration acceptance for later storage/application tasks. P0-W1-007 owns W001-W003; neither P0-W1-005 nor P0-W1-006 satisfies its workspace acceptance gate.

## Atomic update semantics

Full analysis writes staging state, validates it, then atomically activates the new indexed revision. Incremental updates validate a complete patch, apply it in one transaction, recompute provider support, and activate only on success. Evidence is invalidated/superseded rather than erased when historical provenance matters.

## Derived indexes

FTS5 tables and any Zvec indexes are rebuildable from canonical rows. Vector records include entity ID/revision, content hash, and embedding profile ID. An embedding-profile change dirties only the vector index.
