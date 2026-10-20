# Phase 0.5 integrated exit audit — 2026-10-20

Current integration HOLD: later PR21 push39348380807 at81f1a45 has one mandatory
Native test failure (offline dense-upsert preparation TIMEOUT,702/703). Original
complete log and failure artifacts are preserved; CURRENT_STATUS records the
single unmodified/diagnostic local observations and the bounded test-only trace.
Underlying cause is not yet established. The passing source audit below does not
waive this failure, prove a fix, authorize merge or advance Phase1. No deadline or
numerical gate is raised. Closeout remains pending diagnosis and current gates.

## Decision and scope

All 21 original Phase 0.5 exit checks pass on the product integrated by
[PR #20](https://github.com/tim-zxy/CodeAtlas/pull/20), normal merge
`ee0a9199c02ed51f54521bf87489439a5e54e491`. The merge tree is identical to tested
head `bdee0df36e00232b98c68ffaf40d9ffa49fa7e4d` (`git diff bdee0df origin/main`
is empty at that merge). This audit closes the four remaining product parents:
P05-W3-020, P05-W5-001, P05-W8-001 and P05-W9-001, bringing integrated product
tasks to 14/14. Normal integration of these closeout documents remains required
before Phase 1 detailed planning starts. Phase 1 is DESIGN-READY, not permission
to code. No threshold, Fixture baseline, phase scope or FROZEN decision changes.

## Reproducible evidence

The SAME evidence workspace is
`.superpowers/sdd/2026-10-13-p05-index-evaluation-closeout/` (called `E` below).
Original failed attempts remain there; no historical FAIL is rewritten.

- [PR run 39329229206](https://github.com/tim-zxy/CodeAtlas/actions/runs/39329229206)
  and [push run 39329221766](https://github.com/tim-zxy/CodeAtlas/actions/runs/39329221766)
  both identify exact head bdee0df and pass TypeScript, Rust and Native jobs.
  Both pass `Require approved exact-pack Native REFRESH actual22`.
- `E/task8-r2-final-gates-summary.json` records 17/17 original local commands
  exit 0, including complete root 1582 pass/0 fail/one existing Windows skip,
  Native 114, Rust 133, registered REFRESH 703/703, memory collector 27,
  16 TypeScript builds, IR types, architecture 17, boundary tests and formatting.
  It describes constituent commands, not a successful `pnpm verify` wrapper.
- `E/task8-r2-integration-preflight.json` rechecks original local actual22/31,
  all gate outputs, immutable inputs and full 2329 dependency membership.
- `E/task8-r2-actual-evaluation/report/report.json` is schema v2: all 31 required
  rows pass, no missing runs/failures; all 21 incremental obligations remain.
  SHA256 `e2fefab02ccc63e9cb702d465c3510454f5f98c511a564d4d297d3695e96c985`.
  Reproduction uses the original command/arguments in the final-gates summary,
  original pinned configuration and Native binary, and a new exclusive output
  directory. Do not overwrite the original output or rerun merely to pick samples.
- `gh run download 39329229206 --repo tim-zxy/CodeAtlas --name native-memory-observations --dir <new-directory>`
  retrieves [artifact 12228172902](https://github.com/tim-zxy/CodeAtlas/actions/runs/39329229206/artifacts/12228172902).
  Download completed; `exact-pack/acceptance/ci-result.json` is success/ACTUAL.
  Original actual holdout SHA256 is
  `5dfc309c81b576c1406eec2599ce6c8f3f7cc263affc4d446b67f634fa565cc1`.
  All 22 exact classes pass the existing `validateRefreshCiActualReport` with
  original full corpus identity; all 22 original receipts say admitted, with
  transactions/TEMP closed. Maximum observed peak 363589632 <= approved 411660288.
  `E/task8-r2-hosted-audit.json` records this read-only revalidation and the local
  Evaluation/worker audit. It is not another measurement or installation.
- Hosted approval SHA256
  `115d900c85179e4e3f87f3b1a86fe0db10a414c8369cda7803506c8f45175df3`,
  downloaded ZIP SHA256
  `76f8dbc4befbe6b5c6c1bc1ed4c6928b5e44d2ce18e24b004b80eb293c84d3a1`,
  size 240450688 and 5423-entry approval agree. Release417778800/asset657493684
  is the new candidate's real immutable asset; old v1 record/Release/root remain.

## Original exit-to-code/Fixture/evidence map

Every row is PASS. Row numbering follows `PHASE_ACCEPTANCE.md`; grouped rows
retain each original obligation. Tests are the registered entries in package.json
and the CI workflow; their full fresh outputs are in E and the linked exact-head runs.

| Exit | Task / design authority | Actual implementation and Fixture/check | Evidence |
| --- | --- | --- | --- |
| 1 Source scanning | P05-W2-001; Source Management | `packages/source/src/scan.ts`; basic-java-repo, gitignore, generated-vendor | Complete root; established Source Fixture tests |
| 2 Java facts / IPC v1 | P05-W3-001..003; Native IPC, ADR-014/015 | Rust java/java_relations; Provider native-analysis; java-basic-symbol, java-nested-types, java-call-basic, java-inheritance, java-overload, java-unresolved-call; strict v1/v2/v3 tests | Native114, Rust133, root protocol tests |
| 3 Language boundary | P05-W3-001; ADR-014, scalability | `crates/native-analyzer/src/language.rs` trait and `java.rs` adapter; no framework interpretation added | Rust symbols/relations tests; architecture and source inspection |
| 4 Canonical normalization | P05-W4-001; Canonical IR | Provider normalizer; canonical-normalization; unresolved/ambiguous targets stay nonresolved | Root normalization; actual31 recorded-provider component |
| 5 Facts/Evidence/bindings persisted | P05-W4-002/P05-W1-010; SQLite Schema | Storage canonical-fact-store; full-analysis-apply, two-provider-same-call | Root Store tests and actual31 physical SQLite comparison |
| 6 Full failure/freshness | P05-W1-010; Runtime Configuration | Runtime full bootstrap and Source activation fingerprint; native-full-bootstrap | Native lifecycle114; root rollback/freshness; actual31 retained-state cases |
| 7 Add/modify/delete | P05-W2-010/P05-W3-020; ADR-016 | Application reconciliation, Runtime refresh and Storage patch; refresh-v3 and incremental-patch-apply | Real Native refresh703; original actual31 transition inventory; local actual CLI receipts |
| 8 Changed-only/restart/no AST | P05-W3-020; ADR-016/018 | Derived per-file summaries and real parser diagnostics; fingerprint restart/dependent refresh | Actual31 parse reference/trial artifacts; registered refresh lifecycle tests |
| 9 Cold/1/5/50 telemetry | P05-W9-001; Evaluation | phase05-code-intelligence independent pinned performance inputs and actual runner | Actual31 COLD/INCREMENTAL_1/5/50 telemetry and exact input identities |
| 10 Worker consistency/bounds | P05-W3-020/P05-W9-001; ADR-018, scalability | Original bounded worker/stream/stage owners; actual workers1/2 with separately captured parser settlement order | Two actual31 worker rows: equal graph/coverage/support, stale0, distinct completion-order hashes; hosted actual22 and required memory gates |
| 11 Distinct analyzer outcomes | P05-W3-003/P05-W3-020; ADR-015/016 | Typed Native/Provider outcomes; java-coverage-* and refresh failure cases | Native/Rust coverage tests; root negative/empty/partial cases; actual31 nonpublication |
| 12 v2 coverage / strict v1 | P05-W3-003; ADR-015 | Native v2 site partition/resolution statistics; strict v1 unavailable statistics | Shared v2 coverage byte corpus; Native coverage goldens and failure recovery |
| 13 Multi-support removal | P05-W4-002; Fact Identity and Merging | FactMerger and persisted support; two-provider-same-call | Recorded-provider SQLite actual31 case and root support-lifetime tests |
| 14 Candidate reselection/failure | P05-W1-011; SQLite Schema | R009 active candidates and atomic patch Store; incremental-patch-apply | Root exact preserved graph/Evidence/bindings/pointer controls; actual31 reselection |
| 15 Revision applicability | P05-W1-011; accepted cross-revision amendment | Same WORKTREE fingerprint advancement; different/immutable revision controlled full-analysis-required | Registered incremental-patch-apply tests in complete root; original graph/state retained |
| 16 Understand / CODE_TRACE | P05-W5-001/P05-W8-001; Agent API | Application/Runtime code-query, Storage queries, CLI code-query-command; p05-code-query-cli-v1 | Complete root query/CLI tests; actual CLI read-only/restart receipts |
| 17 Critical Symbol Recall >= .95 | P05-W9-001; Evaluation | Original declared critical-symbol scope | Actual31 value1, PASS |
| 18 Critical Direct Call Precision >= .95 | P05-W9-001; Evaluation | Original declared direct-call scope; extra predictions remain FP | Actual31 value1, PASS |
| 19 Critical Direct Call Recall >= .90 | P05-W9-001; Evaluation | Same original scope, no target guessing | Actual31 value1, PASS |
| 20 Incremental correctness ==1 | P05-W3-020/P05-W9-001; ADR-016/017 | All original 21 incremental obligations retained | Actual31 value1, PASS |
| 21 Stale bindings ==0 | P05-W4-002/P05-W1-011/P05-W9-001 | Exact persisted support/binding comparisons | Actual31 value0, PASS |

ADR-016's additional applicability obligation also passes: real Native/Store
refresh tests cover atomic summary/graph/support/Evidence/coverage/fingerprint
activation, restart, stale/empty-delta retry, malformed/incompatible/legacy input,
ownership conflicts, failure rollback and resource refusal. They are not replaced
by contract-only fixtures or by the numerical summary.

## Limitations and follow-up

- ADR-017 evidence layers remain 28 NATIVE_INDEX, 2 RECORDED_PROVIDER_SQLITE and
  1 DECLARED_SOURCE_NATIVE. Component observations are not live Java extraction
  samples and the metadata case is not a public Source role override.
- Telemetry unavailable reasons remain explicit. Node `resourceUsage.maxRSS`
  excludes the Native child; finite sampled peaks are not OS RSS guarantees.
  No new latency/throughput threshold or universal repository accuracy is claimed.
- A retained independent CLI smoke found duplicate initialization returning
  `SOURCE_FAILED` rather than the more specific `DATABASE_ALREADY_EXISTS`.
  Recovery proves no write/graph attempt and unchanged bytes; the original
  failure is preserved. This reviewed Minor diagnostic-specific limitation is
  not silently fixed after freeze, not a passing smoke, and not an original
  Phase exit failure. Consider the typed diagnostic correction in a separately
  tested future change, not as an unapproved prerequisite to Phase 1.
- Local main at `D:/workspace/CodeAtlas` remains8093b2b: fast-forward is safely
  refused on overlapping dirty paths. No reset/stash/staging of unrelated files,
  EOL rewrite or cleanup is authorized here. Remote main is correctly merged;
  this local synchronization limitation does not falsify integrated product proof.
- Earlier 10/14/pending notes in the handoff are chronological evidence. This
  audit supersedes their current-state conclusions only, preserving original logs,
  profiles, failed captures and both fixed roots. No deferred capability advances.
