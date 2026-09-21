# P0-W1-007 Workspace Database Design

Status: implementation design for the existing Phase 0 task. This refines the SQLite Schema specification without changing an ADR or Frozen architecture decision.

## Scope and ownership

Extend only the production `WORKSPACE` manifest with W001 through W003. Reuse the storage-owned migration runner. Keep the R001-R007 repository manifest unchanged. This task creates workspace registration and immutable revision-set structure; it does not create services, contracts, execution, documents, claims, knowledge, lifecycle, evaluation, usage, FTS, or vector tables.

## Relational mapping

| Migration | Tables | Essential contract |
| --- | --- | --- |
| W001 `workspace_core` | `workspace` | A workspace database contains one stable workspace ID and mutable root-path locator. |
| W002 `repositories` | `repositories` | Stable repository IDs are registered under the workspace; root paths are locators. Repository database contents remain separate and are not copied or foreign-keyed across databases. |
| W003 `revision_sets` | `revision_sets`, `revision_set_items` | A set selects at most one revision ID and fingerprint per registered repository. `frozen` is `0 | 1`; transition to `1` is allowed once and is irreversible. |

Opaque IDs, fingerprints, and paths use `TEXT`; creation time uses epoch-millisecond `INTEGER`. The schema does not define a Workspace or RevisionSet public IR contract. Application services will later validate complete workflow input before mutation.

## Freeze semantics

SQLite constraints and triggers enforce the Frozen invariant at the authoritative store:

- a mutable set may add, update, or remove items;
- changing `frozen` from `0` to `1` is allowed;
- a frozen set cannot be updated, deleted, or unfrozen;
- no item of a frozen set can be inserted, updated, or deleted;
- deleting a registered repository is rejected while any revision-set item refers to it.

The triggers are storage safeguards, not a bypass around future Application/Domain services. This task exposes no direct database mutation API.

## Fixture and acceptance

`p0-workspace-schema-v1` covers fresh-to-latest, every sequential boundary, constraints/database isolation, and frozen RevisionSet immutability on real temporary SQLite files. It verifies an exact Phase 0 table inventory and absence of W004-W012 tables. Root `pnpm test` and `pnpm verify` include the Fixture tests.

## Deferred boundary

Knowledge compilation will create/freeze RevisionSets in Phase 1 through validated workflows; it is not implemented here. Repository revisions are referenced by stable ID and fingerprint because SQLite cannot enforce foreign keys across independent repository databases. W004-W012 and all Phase 1/2/3 features remain deferred.
