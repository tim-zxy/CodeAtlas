# P0-W1-006 Repository Database Design

Status: implementation design for the existing Phase 0 task. This refines the SQLite Schema specification without changing an ADR or a Frozen architecture decision.

## Scope and ownership

Extend only the production `REPOSITORY` manifest with seven immutable SQL migrations, R001 through R007. Reuse the P0-W1-005 storage-owned runner and Node SQLite. Keep the `WORKSPACE` manifest empty. This task creates relational structure and indexes, not repositories, graph activation, Provider execution, FactMerger, knowledge publication, or a general-purpose storage API. No Rust or Provider package may write SQLite.

## Relational mapping

The existing strict IR schemas define the value boundary. SQLite uses `TEXT` for opaque IDs/fingerprints, `INTEGER` epoch milliseconds for timestamps, `REAL` for confidence scores, and JSON text only for nested arrays or nullable `SourceRange` objects. SQL constraints protect obvious invalid states; later validated Application/Storage workflows remain responsible for complete IR and cross-record validation. A per-repository database contains one `repository` row, identified by its stable ID; `root_path` is a mutable locator, not identity.

| Migration | Tables | Essential keys and relationships |
| --- | --- | --- |
| R001 `repo_core` | `repository`, `repository_state` | Stable repository ID; nullable `indexed_revision_id` is an activation pointer, not automatically advanced by migration. |
| R002 `source_revision` | `revisions`, `source_files` | Revision ID belongs to one repository; source-file identity is `(revision_id, id)` so one logical file ID can recur across revisions. `(revision_id, path)` is unique. Revision variant fields are checked by kind. |
| R003 `provider_runtime` | `provider_snapshots`, `provider_capabilities` | Snapshot ID and requested revision/fingerprint retain observation provenance; capabilities are unique by `(snapshot_id, name)`. Failed/partial snapshots remain representable. |
| R004 `code_graph` | `canonical_nodes`, `canonical_edges`, `unresolved_targets` | Canonical IDs and FactKeys are unique within a revision, not derived from Provider IDs. Edge source and resolved target reference nodes in the same revision. Unresolved/ambiguous/unsupported targets retain hint and ordered candidate IDs in JSON, never force one target. |
| R005 `evidence` | `evidence`, `fact_evidence`, `provider_fact_bindings` | Evidence identity/status remain separate from Canonical Fact identity. Relation rows permit independent supports. Polymorphic NODE/EDGE references and source-tuple consistency require later validated application writes; migrations do not invent a canonical fact. |
| R006 `analysis_coverage` | `analysis_coverage` | Snapshot/capability coverage can be aggregate or source-file scoped; exact future IPC metric shapes are not frozen here. |
| R007 `diagnostics` | `analysis_diagnostics` | Ordered, bounded diagnostic metadata belongs to a Provider snapshot; no raw source or unrestricted Provider payload. |

The graph tables carry `repository_id` and `revision_id`, foreign keys to the repository/revision where unambiguous, and explicit kinds, FactKeys, source/target identity, confidence, and optional range. The `unresolved_targets` row is keyed to an unresolved edge and stores its `original_hint` and candidate array. The relational schema is not a substitute for the Canonical IR parser: it deliberately does not coerce or choose ambiguous targets. `repository_state.indexed_revision_id` remains nullable at migration completion and is activated only by a later validated graph-apply workflow.

## Index and safety contract

Critical indexes cover normalized source path, revision fingerprint, Provider snapshot revision/provider, Canonical node FactKey/kind, edge FactKey/source/resolved target/kind, unresolved hint, Evidence snapshot/status, Provider binding tuple, coverage capability, and diagnostics snapshot. `PRAGMA foreign_keys` is enabled by the runner. SQL files contain no transaction control or `PRAGMA user_version`; P0-W1-005 owns those actions. Published migration files and checksums are immutable.

## Fixture and acceptance

`p0-repository-schema-v1` declares fresh-to-latest and every sequential boundary from version 0 through 7. Real temporary SQLite files must prove the exact table/index inventory, version progression, rerun safety, representative constraints/relationships, and absence of workspace or Phase 1 tables. A failed migration/checksum still follows the P0-W1-005 rollback semantics. The root `pnpm test` and `pnpm verify` gates must include this fixture; `DESIGN_TRACEABILITY.md`, `SQLITE_SCHEMA.md`, and `CURRENT_STATUS.md` must match the observed result.

## Deferred and compatibility boundary

W001-W003 belong to P0-W1-007. Full-analysis staging/activation and incremental patch writes belong to Phase 0.5. `ExecutionGraph`, `RuntimeFlow`, FTS5, vectors, LLM, Knowledge, and Wiki are not added. The schema is additive to the empty repository manifest; it does not modify the P0-W1-005 runner API or Canonical IR wire schemas.
