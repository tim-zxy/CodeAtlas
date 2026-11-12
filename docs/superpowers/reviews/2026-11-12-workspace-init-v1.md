# P1-19 explicit init v1 implementation

Approved contract: [workspace-init-v1](../specs/2026-11-12-workspace-init-v1.md).
Existing discovery/config precedence, explicit budget semantics, W001..008 and
R001..013 stay unchanged. CLI now routes init directly to Runtime; no bootstrap
Source scan, Git, Native, indexing, model, credential resolution or background work.
All actual runs here were self-created temporary roots and SQLite databases.

Implemented .ekp/config.yaml, workspace.sqlite, repositories/<directoryKey>/index.sqlite
and completion init.json last. New UUIDs are opaque IDs and separate locator keys,
not root/name-derived identity or revision inheritance. ConfigurationSources JSON
is explicit and bounded before parse. Existing EffectiveConfig performs validation
and YAML layer precedence; resolved workspace snapshot is saved as YAML without
unknown values/warnings, warnings returned separately. No numeric default or
implicit global config location. No --force/resume/--index route.

Exclusive mkdir elects a creator. Reused Repository sessions create and close only
new version13 DBs; Workspace helper creates version8 and atomically registers the
selected canonical roots. Both bindings are independently reopened/checked before
marker publication. Complete same-request reentry only validates; conflict,
incomplete/foreign layout, unexpected files and missing DB refuse without adoption.
Initial full DB hashes are not permanent pins: normal indexed content can change.
Readonly reentry supports a closed, checkpointed WAL-mode main image, but an active
-wal/-shm/-journal is refused before open. Init-only immutable SQLite URIs prevent
recovery/SHM writes. This deliberately does not take a live snapshot from a writer
or silently checkpoint/migrate the old database. General readers are unchanged.

Directory/file instance/stat seals are retained and rechecked through publication/
return; descriptor-owned write stats survive close. These checks do not provide
OS hostile-process isolation, power-loss durability or multi-DB atomic rollback.
Files are never deleted/resumed automatically. Partial database writes remain even
when initializationEffect is NOT_COMMITTED (completion-marker effect only).
Uncertain marker write/close stays UNKNOWN; known marker commit survives output or
later failure. Cleanup UNKNOWN cannot become success. Per-DB effects remain distinct.

Fresh verification: Storage, Runtime and CLI tsc builds pass. Final117/117 tests,
0fail/cancel/skip/TODO,20438.2636ms; architecture17 and scoped format/diff pass.
Seventeen new mandatory cases (14 Runtime,3 CLI) plus existing new-DB/migration/
Repository-session/config/doctor/bootstrap/architecture guard regressions. Two test
files registered once; no historical Fixture baseline or acceptance number changed.
Raw local logs .superpowers/sdd/2026-11-12-workspace-init-v1/reviewed-tests.log;
previous116 log retained, overlapping totals must not be summed.

Missing implementation positive RED observed before coding. Independent review
found3P2: ordinary readonly WAL writes, missing final file seals, lost control
classification. All three were reproduced RED and fixed. Narrow follow-up found
new-write pin adoption across close, fixed with retained descriptor stats and an
owned close-hook replacement case. Mid-init cancellation also reproduced old
opener's stop translation; a delegated-control wrapper preserves original closed
codes without changing the general opener. Final readonly review reports no
remaining P1/P2; reviewer did not execute tests or user-data operations. A final
configuration-warning preservation case was added and tested afterward.

Actual CLI child tests run with empty PATH, no Rust/model: first create and matching
reentry pass; invalid args/read limit do not initialize; failed output retains
COMMITTED. Owned real SQLite tests cover failure preservation, lost metadata ack/
rollback/cleanup, closed WAL no-write, active WAL refusal, same-byte replacement,
marker-close replacement, cancellation, concurrency and empty selection. Test
roots and failed evidence remain owned temporaries; no user project was initialized.

~~~text
node node_modules/typescript/bin/tsc -p packages/storage/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/runtime/tsconfig.json
node node_modules/typescript/bin/tsc -p apps/cli/tsconfig.json
node --test --test-reporter=tap --test-concurrency=1 packages/runtime/test/workspace-initialization.test.mjs apps/cli/test/init.test.mjs packages/storage/test/workspace-initialization.test.mjs packages/storage/test/repository-index-session.test.mjs packages/storage/test/migration-runner-application.test.mjs packages/storage/test/migration-runner-failures.test.mjs packages/storage/test/migration-runner.test.mjs packages/runtime/test/effective-config.test.mjs apps/cli/test/doctor.test.mjs scripts/test-runtime-construction.mjs scripts/test-workspace-structure.mjs
node scripts/check-architecture.mjs
~~~

Predecessor CI220 exactad3839c is terminal TS/Rust PASS, Native historicalR8 catalog
FAIL, actual22 SKIPPED: https://github.com/tim-zxy/CodeAtlas/actions/runs/43194897054.
Its results do not qualify this new source. Existing27 unrelated entries retained.
No Public validation trust schedule or R8 pin/reference/gate change, actual22,
profile/PACK/release, user migration, production scan/query/publication or real
model run. Full installed-package/platform/E15/Phase1 acceptance remains open;
Phase1 stays4/21,A6 NOT_QUALIFIED,E02 PROPOSED/uninstalled. Disable the new CLI route
for rollback; preserve all created directories, original records and DBs.
