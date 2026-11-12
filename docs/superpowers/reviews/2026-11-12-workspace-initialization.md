# P1-19 private new Workspace metadata leaf

Authority: RUNTIME_CONFIGURATION discovery/initialization, existing Workspace W001
workspace and W002 repositories, manifest001..008, P1-19 in the approved Phase1
knowledge/delivery plan. Repositories may be outside the workspace root. Existing
EffectiveConfig schema is implemented; full init still needs exact creation/layout,
config/default and multi-file recovery decisions. This leaf does not decide them.

Success criteria: explicit new DB locator, workspace/repository IDs and existing
canonical roots are owned before callbacks; exclusive creation never adopts or
replaces a file; existing verified migrations reach8; W001/W002 rows commit
atomically and survive real close/reopen. Existing001..008 stay unchanged; no
new public export/schema/dependency/default, repository DB/RevisionSet/indexing,
source read, permission grant or Native/model invocation.

Database parent must already exist and be canonical. File/parent/root instance
checks reject observable replacement/link states but are not OS isolation or an
ACL authorization proof. Control callbacks are trusted host ports. Input and actual
canonical written text are conservatively charged; metadata rows are charged
before creation. An asynchronous/unknown synchronous-budget acknowledgement is
rejected before acquisition with cleanup UNKNOWN. No calibrated resource profile
or hard resource cap is claimed. Partial migration files remain for diagnosis and
are never automatically adopted/deleted/retried. Version8 is a deliberate maximum:
future migration manifests require a separate scoped change, not implicit009/010.

Metadata transaction effect and resource cleanup are separate: known COMMIT stays
COMMITTED even if close fails; lost COMMIT acknowledgement remains UNKNOWN and
subsequent creation refuses EEXIST. Rollback confirms NOT_COMMITTED; failed rollback
or resource close retains UNKNOWN. These are private operation receipts, not new
canonical/public run or publication semantics. A completed prefix migration is not
a completed metadata initialization.

Evidence: missing-API positive RED before implementation; async-budget RED exposed
ignored settlement and was fixed. Final Storage tsc build and55/55 tests,0 failures,
cancels,skips,TODO,4694.578ms. Eleven new cases registered once in root test list:
real reopen, existing sentinel, duplicate IDs/roots, owned input/accessors, metadata
rollback, lost acknowledgement, partial migration, postcommit cleanup failure,
control denial, unsettled budget and aliased parent. Existing repository session
and migration Fixture/failure regressions included. Architecture17 and scoped
Prettier/diff checks pass. Raw local evidence:
.superpowers/sdd/2026-11-12-workspace-initialization/targeted-tests.log.

Independent read-only review found no P1/P2; explicitly confirmed no implicit9/10,
adoption or CLI/indexing path. Review did not run tests; counts above are executor
evidence. No test user DB or production use is implied by owned temporary files.

Predecessor CI218 exactdb7160539024e76aba677d95bc90e8b34630a9a0 is terminal:
TypeScript/Rust PASS, Native script-catalog prerequisite FAIL, actual22 SKIPPED:
https://github.com/tim-zxy/CodeAtlas/actions/runs/43189818767.
Its TS result does not qualify this new source. R8's expected189/current209,
20added/15changed scripts are real source changes; do not update historical pins
to conceal mismatch. Public trust schedule and actual22 remain untouched.

Reproduce from the active worktree:

~~~text
node node_modules/typescript/bin/tsc -p packages/storage/tsconfig.json
node --test --test-reporter=tap --test-concurrency=1 packages/storage/test/workspace-initialization.test.mjs packages/storage/test/repository-index-session.test.mjs packages/storage/test/migration-runner-application.test.mjs packages/storage/test/migration-runner-failures.test.mjs packages/storage/test/migration-runner.test.mjs
node scripts/check-architecture.mjs
~~~

Not full P1-19, P1-11, Native/A6 or Phase1 acceptance. Full CLI init's layout/default
packet and cross-file completion/recovery remain explicit next dependencies; real
model endpoint/credential/prompt-registry integration remains separately bounded.
