# P1-19 Codex CLI preview

User approved a stdin-only CLI preview and runtime declaration of the already
locked smol-toml1.8.0, no version change. Existing planAgentSetup behavior remains:
enabled=false, applySupported=false, executionAuthorized=false, productionLaunch
UNAVAILABLE. Original pure planner has no filesystem/process/network operation.
CLI never accepts config paths or discovers user home/config; all launch paths
are explicit unexecuted values. No apply/install/start/Codex/MCP execution path.

New command: codeatlas setup --dry-run --max-request-bytes <N> --input-timeout-ms <N>.
Stdin is strict UTF8 JSON with exactly client,configToml,nodeExecutable,mcpEntryPath,
workspaceRoot,maxConfigBytes,maxPlanBytes. TOML is an explicit string or null,
converted to owned bytes; no file is read by the handler. Required byte ceilings
have no defaults. Abortable input timeout closes the input, no parser/payload
error echo; it does not preempt synchronous parsing CPU or claim hard memory
isolation. Exit0 means preview written even for CONFLICT/SNIPPET_ONLY, not consent.
Output error exits1, malformed arguments/input exit2, input timeout exits1.

Dependency audit: current installed smol-toml1.8.0 metadata/19-file SHA inventory,
BSD-3-Clause license and attribution retained in apps/cli/THIRD_PARTY_NOTICES.md.
Node engine>=18; Node24 local build/protocol tests work. No runtime dependencies,
install lifecycle scripts, new package/version or local install. Existing root
dev dependency remains; CLI importer adds the same exact version. Parsed full
before/after lock assertion proves packages, snapshots, SRI, other importers and
settings identical after removing this single importer addition. This is reuse
of the existing approved lock/installed bytes, not independent new-registry
provenance proof or exhaustive vulnerability clearance. Lock integrity remains:
sha512-kCZr2V3ch9i00x8zXRhjUNVcjG9ijES5dDudkXvUVCT5QlJNQWElSJdZqyPemffHoLNUYwOcou0Fy+ojN0uHSQ==.

Evidence .superpowers/sdd/2026-11-12-codex-cli-preview/dependency-audit.json and
lock-before.yaml/lock-after.yaml. These local lock snapshots contain only existing
public dependency metadata. Exact architecture guard now expects the approved
CLI dependency; no broad allowlist or gate weakening.

Initial actual CLI test observed missing-route RED. Seven new mandatory cases:
valid disabled preview, conflict/invalid TOML no secret echo, malformed/forbidden
input/actions, byte/timeout closure, output failure, strict UTF8/help/flag shape,
and owned-cwd canary with nonexistent launch paths. No HOME/CODEX_HOME is changed;
no real user config used. Existing eight planner regressions reused. Final48/48,
0fail/cancel/skip/TODO,20840.1172ms; Runtime/CLI builds, architecture17 and scoped
format/diff pass. Raw log .superpowers/sdd/2026-11-12-codex-cli-preview/targeted-tests.log.
Includes existing init/doctor/bootstrap/workspace guard regressions. Test totals
overlap historical runs and must not be added. No whole-phase/installed-platform
or production readiness is inferred.

Independent readonly code review reports no P1/P2. Reviewer initially could not
use Git in its environment; executor provided committed/current lock snapshots
for independent comparison rather than retrying blocked Git. Review did not run
tests, access user databases or perform installation. The independent snapshot
comparison subsequently confirmed only that importer change, after=current and
all19 package files match the audit; the earlier Git limitation is closed. Source/data permissions
and original lifecycle/scan/quality gates remain unchanged.

~~~text
node node_modules/typescript/bin/tsc -p packages/runtime/tsconfig.json
node node_modules/typescript/bin/tsc -p apps/cli/tsconfig.json
node --test --test-reporter=tap --test-concurrency=1 apps/cli/test/agent-setup.test.mjs packages/runtime/test/agent-setup-plan.test.mjs apps/cli/test/init.test.mjs apps/cli/test/doctor.test.mjs scripts/test-workspace-structure.mjs scripts/test-runtime-construction.mjs
node scripts/check-architecture.mjs
~~~

Predecessor CI221 exactc75b330 is terminal TS/Rust PASS, Native historicalR8 catalog
FAIL, actual22 SKIPPED: https://github.com/tim-zxy/CodeAtlas/actions/runs/43205905641.
New source CI is separate. Existing27 unrelated worktree entries remain. No
Public validation trust schedule, actual22, R8 pin/reference, user DB/migration,
production scan/query/publication, real model or installed component change.
Phase1 remains4/21,A6 NOT_QUALIFIED,E02 PROPOSED/uninstalled. Rollback stops selecting
the additive preview route; it has no configuration writes to reverse.
