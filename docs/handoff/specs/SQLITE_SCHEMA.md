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

The storage package owns SQLite connections and separate `REPOSITORY` and `WORKSPACE` migration manifests. Each manifest is schema version `1` with exactly `schemaVersion`, `databaseKind`, and ordered `migrations`. Each entry has exactly `version`, `name`, `file`, `checksum`, and `backupRequired`. Versions are unique safe positive integers, ordered contiguously from `1`; names and files are unique. Files use safe relative POSIX paths contained by the manifest directory, including after symlink resolution. A kind mismatch is rejected. The checked-in Phase 0 production manifests are empty for both kinds; P0-W1-005 creates no R/W business tables.

The loader validates every entry and reads every SQL file before opening a transaction. Files are strict UTF-8 without BOM; CRLF and CR normalize to LF, with all other content preserved. SHA-256 is compared against the lowercase `sha256:<64 hex>` value after normalization. Published files and checksums are immutable; a correction is a new migration. Any malformed manifest, unreadable file, or checksum mismatch fails before mutation.

The Node 24 `node:sqlite` runner reads `PRAGMA user_version`, rejects invalid or newer-than-plan versions, and applies each pending migration in its own `BEGIN IMMEDIATE` transaction. It re-reads the version under the write lock so a concurrent advance is not replayed. Migration SQL cannot control transactions or write `user_version`; the runner updates `user_version` only after SQL succeeds and verifies it before commit. Failure rolls back only the current transaction and closes the connection; prior committed versions remain available. Reruns apply only pending versions. A pending `backupRequired: true` entry is rejected before mutation until backup orchestration is available; the runner does not silently back up.

The closed storage error family is `MIGRATION_MANIFEST_INVALID`, `MIGRATION_DATABASE_KIND_MISMATCH`, `MIGRATION_FILE_INVALID`, `MIGRATION_CHECKSUM_MISMATCH`, `MIGRATION_BACKUP_REQUIRED`, `DATABASE_VERSION_INVALID`, `DATABASE_TOO_NEW`, `MIGRATION_LOCKED`, `MIGRATION_VERSION_CHANGED`, `MIGRATION_TRANSACTION_ESCAPED`, and `MIGRATION_FAILED`. No raw SQL is included in public error messages. `fixtures/storage/migrations/cases.json` (`p0-migration-runner-v1`) covers empty, sequential upgrade, failed migration, and too-new scenarios, with locking, checksum, transaction-control, and rerun assertions in the storage tests.

Required later schema tests remain fresh-to-latest, every sequential boundary, independent repository DB rebuild, and workspace continuity. P0-W1-006 and P0-W1-007 own those business-table migrations; P0-W1-005 does not satisfy their acceptance gates.

## Atomic update semantics

Full analysis writes staging state, validates it, then atomically activates the new indexed revision. Incremental updates validate a complete patch, apply it in one transaction, recompute provider support, and activate only on success. Evidence is invalidated/superseded rather than erased when historical provenance matters.

## Derived indexes

FTS5 tables and any Zvec indexes are rebuildable from canonical rows. Vector records include entity ID/revision, content hash, and embedding profile ID. An embedding-profile change dirties only the vector index.
