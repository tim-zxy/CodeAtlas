# B0b-1 offline Code/Syntax contract implementation author review

Date: 2026-10-24. Kind: AUTHOR_IMPLEMENTATION_REVIEW; no independent review. Scope: [approved plan](../plans/2026-10-24-phase1-code-syntax-contract.md), [accepted DCP](../specs/2026-10-23-phase1-b0b-completeness-proposal.md), Tasks 1 → 2 → 3 → 4 only. Original C worktree, existing session, sequential execution; HEAD cc5a8cb571986c5e56ed04053b2c96ef500fcacb, branch codex/p05-integrated-exit-audit. No commit range was created.

## Outcome and evidence

B0b-1 is complete for LOCAL_OFFLINE_CONTRACT only. Providers build exit0; exact 25-file local regression 436 PASS / 0 FAIL / 0 SKIP / 0 TODO, including 107 new contract tests; architecture check passes for 17 projects. Registry48/exact22 Phase1, exactly p1-code-syntax-completeness-v1 added, no removed ID; Runtime Syntax catalog0. This does not close B0b-2/3, B1/C, P1-04/05 or any Phase1 exit.

Reproducible evidence root: `.superpowers/sdd/2026-10-24-phase1-code-syntax-contract/`. Commands and full logs: `executed-verification-command.json`, `task4-confirmed-build.log`, `task4-confirmed-scoped-tests.log`, `task4-confirmed-architecture.log`; integrity and bounded closure: `implementation-verification.json`, `preservation-and-registry.json`. No new numbers/defaults/profiles, Rust/Native/helper/acquisition, DB/R4, root verification, cloud operation, stage/commit or cleanup.

## What changed

One isolated Providers module validates actual request/output bytes through existing strict IR/Syntax schemas, existing controlled errors, SHA256, fatal UTF8 and request/hard bounds. Its only public additions are the validator and its result type. Result has exactly eight fields, recursively frozen, with no authorization token or raw byte view. A private post-v5-shape v4 request view reuses common Source/context/owner checks; it neither dispatches old wire nor fabricates old output.

Python Code covers MODULE/FUNCTION/IMPORT/REFERENCE with exact per-file coverage/statistics. Function facts match unique declarations by owner and enclosing range. Imports consume exact alias references before other references; nested value occurrences preserve owner, target, enclosing range and multiplicity. Java has Syntax responsibility here and a separate full v2 Code reference; it is not granted Code completeness by absent v5 Code events. File/facet/diagnostic ordering and independent Code/Syntax outcomes are checked.

One root test registration and precisely two added index lines are mirrored in the existing exact workspace assertion; old assertions were retained. No old product module, old schema, normalizer, IR, migration, caller or descriptor was changed by this task. Thirteen governance/specification documents and the concrete plan now record this bounded evidence.

## Task and obligation trace

| Task / design basis                   | Fixture and tests                                                                                                                                                          | Verified exit / remaining gate                                                                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: DCP§4/5/7 independent scope/oracle | p1-code-syntax-completeness-v1:12 seeds, 44 frozen files, Java v2 companion, 12 old provenance hashes; independently encoded Canonical expectations                        | Author script imports0 product modules; pre-product SHA freeze unchanged; actual missing-export RED. This is authored contract data, not Native extraction evidence                    |
| 2: DCP§5 raw v5/context/security      | New framing/request/Unicode/unsafe-view/binding/failure/budget tests; old v1..4/owner/budget regression                                                                    | Strict raw framing, exact byte hashes/counts, bounded decoding, eight-key frozen result; no fallback or authority                                                                      |
| 3: DCP§4/5 coverage/correspondence    | Twelve exact decisions/full streams/Canonical references; repaired-count/SHA negatives; span, alias, nested array/object, multiplicity, partial/empty/Java and order tests | Structural closure only. Resealed FUNCTION/IMPORT/REFERENCE omissions may pass structure yet differ from frozen full-output oracle; source truth not inferred                          |
| 4: DCP§8/9 compatibility/governance   | Registration and exact-index RED → GREEN; 25 files436PASS; architecture17; preservation/registry audit                                                                     | 275 prior Fixture paths unchanged,44 new frozen paths unchanged;767 predecessor paths audited with only18 declared changed paths/no missing/unexpected. No required Phase gate removed |

The named local suite also exercises existing Python/Java normalization, canonical identity, FactMerger, manifest/registry and seven prior full-output oracles. No tests use a new producer to author their expected output. Empty legacy qualityGates do not confer Phase1 acceptance.

## Failure history and corrections

- `task1-api-red.log`: genuine undefined-versus-function RED after a successful baseline Providers build.
- `task2-3-contract-red.log`:99 tests fail on missing API before implementation.
- `task2-build.log`: branded Source ID Map keys were inferred narrower than validated event IDs; explicit string lookup-key types corrected TypeScript checking without casts or IR changes. `task2-build-corrected.log` and final build pass.
- `task4-registration-red.log`:106 PASS/1 FAIL, actual0-versus1 registration; `task4-workspace-export-red.log`: exact old index assertion failure. Both corrected by the planned registration/two-line assertion addition.
- `task4-scoped-tests.log`:435 PASS/1 FAIL; pre-existing plan checkpoint text in scalability still contained the obsolete pending-review literal. Updated the governed current checkpoint, retained original snapshot and test. Final436 PASS.
- `doc-sync-first-failure.log`: document script stopped after12 notices on the separately handled plan heading; DCP/plan were then handled explicitly. No product change or Fixture reauthoring resulted. Original doc snapshots retained under `before-doc-sync/`.

## Review assessment

Strengths: independent pre-product raw references, exact request binding beyond owner-map scope, explicit partial and empty responsibilities, no old-wire relaxation, and controlled errors without echoing raw data. Reviewed new module/tests/helper/Fixture provenance, exact before/after index/registration/assertion, DCP Review Focus and affected governance. No unresolved Critical or Important issue found within the approved offline obligations. This is author review, not independent review or merge readiness.

| Considered but not judged complete                                                                      | Executor ruling / practical cost                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actual Source extraction, source-byte truth/TOCTOU, real maxItems work, wall time/memory/cancel/restart | Outside this pure API; keep B0b-2/C gates open. Structural acceptance cannot establish truthful Native output                                                                                       |
| Trust in supplied owner/stage/removed declarations and Java companion                                   | Binding is not authenticity; keep B1 capture/history/retained-support/atomic Apply open; no publication authority                                                                                   |
| Group-local reference matching runtime at production scale                                              | Reuses a bounded per-file interval/multiplicity scan, no dense adjacency allocation; repeated scans can be quadratic. Production timing/resource/profile evidence remains required before admission |
| Independent review/full integration/root and cloud verification                                         | Approved author-review/25-file scope only; no independent or full integration proof                                                                                                                 |
| Commit-coupled task helper scripts / committed diff range                                               | Approved manual receipts in existing workspace; cost is no committed review range. No stage/commit/cleanup                                                                                          |

No additional capability was silently dropped. Existing Canonical IR/provider independence, SQLite authority, LLM candidate-only, AUTO/MANUAL and ExecutionGraph → RuntimeFlow → BusinessFlow remain unchanged.

## Next boundary

Next is B0b-2 concrete design/plan review for isolated v5 producer and bounded consumer. Existing offline contract/Fixture is its input, not its completion evidence. Do not enable Source classification/Runtime routes, invent a snapshot adapter or borrow old profiles. C1 real-file-symlink EPERM stays TODO/OPEN; four C2 acquisition lifetimes remain spent; historical Native timeout root cause UNKNOWN; main CI39708335128 cancellation settlement not re-queried. No cloud/actual Native/profile/numeric/dependency permission is implied.
