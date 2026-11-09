# Replay catalog dependency policy compatibility

Scope: existing approved MCP dependency configuration must not be mistaken for workspace package globs. No public schema, historical membership, sanctioned exclusion, dependency version, baseline, qualification or permission change.

- Reproduced real read-only discovery at fcb1715: Unsupported workspace catalog configuration before dependency traversal.
- RED: current finite overrides/release-age configuration failed; seven initial refusal cases passed.
- Accept only finite packages, exact-version overrides and version-specific minimumReleaseAgeExclude syntax. Keep complete pnpm-workspace.yaml bytes in catalog; actual installed manifests still determine recursive membership. Unknown/empty/duplicate/malformed sections refuse. Scoped YAML scalars require quotes.
- Independent review found unquoted indicator/scoped scalar acceptance; corrected with rejection examples and a quoted scoped positive case. No topology guard was relaxed.
- Final command: node --test --test-name-pattern="catalog|dependency policy|historical v2 discovery|unknown generator" packages/runtime/test/native-refresh-transport-replay.test.mjs
- Final result:33/33,0fail/cancel/skip/todo,2851.3122ms. Includes historical v2 cache membership, unknown revision, raw-byte catalog, omitted/added roots/dependencies, optional/required resolution, linked files and both unbound-topology rejection cases.
- node scripts/check-architecture.mjs:17 projects passed. Scoped formatting and whitespace verified before commit. No compiler/Native/calibration was executed.

Real repository read-only discovery now passes workspace parsing but refuses at the existing Multiple versions have unbound package resolution topology guard. Independent metadata-only manifest traversal observed content-type1.0.5/2.1.0 and zod4.6.1/4.6.7 among172 physical packages. This traversal is diagnostic only, not an accepted catalog. The old flat-name identity cannot represent those importer-to-instance edges. A versioned catalog topology decision is required; do not erase that rejection, silently flatten packages, modify historic R8 or force a single dependency version.

Native54 source hashes still match prior c6304ca candidate; that does not prove current Runtime/dist/dependency qualification. R9 layout/output were absent at read-only check. Old154 Transport-only scope cannot be claimed sufficient: previous environment review found all three profile families unmatched. Controlled build, source/dist/tool closure, whole-batch process/time/memory limitations, and fresh sampling require specific approval. STOP_REQUESTED remains cooperative, not hard process-tree isolation.

CI202 for fcb1715: Native failed frozen R8 script prerequisite; Rust passed; TypeScript pending at latest check. This repair does not reinterpret that run as current-code evidence. Phase1 remains4/21, A6 NOT_QUALIFIED, E02 PROPOSED/uninstalled. Production/project data, real model, R9, profile adoption/PACK/publication remain closed.
