# Replay topology v4 implementation

- [x] Independent synthetic graph tests: two versions, identical bytes/different import resolution, aliases, missing required/optional, cycles, raw drift and v2/v3 refusal.
- [x] Implement explicit discovery4 with strict instance/import identity and byte/physical topology verification; preserve legacy defaults.
- [x] Connect Manifest3/binding3, v2 execution evidence, case/corpus/verification digest domains, explicit layout10 and pack version gates.
- [x] Run affected original catalog/record/pack/stop tests and architecture/format checks; independent review and associated fixes.
- [x] Update authorities/acceptance/traceability and exact evidence; commit/push only task files, follow CI without duplicates.

Controlling contract: ../specs/2026-11-09-replay-topology-v4.md. No real build/sampling/production permission.

## Evidence and remaining limits

Initial six topology tests RED: unsupported generator4; two independent record tests included a missing digest-domain function RED. New explicit prepare10 test first used a nonexistent receipt filename; corrected to original ci-result.json. No real compiler or Native was launched: this test replaces spawnSync inside its dedicated Node child and verifies original failure recording. Linux instead verifies original unsupported-platform refusal without skip.

Final node --test packages/runtime/test/native-refresh-topology.test.mjs:14/14,0fail/cancel/skip/todo,1573.0923ms. Independent raw SHA/canonical instance-ID vector included.

Final node --test --test-name-pattern="^D5 (topology|catalog|v3 catalog|historical v2 discovery|operational discovery|replay (catalog|locator record|capsule record|manifest record)|cancellation prefix v2)" packages/runtime/test/native-refresh-transport-replay.test.mjs:78/78,0fail/cancel/skip/todo,3109.7431ms.

node --test --test-concurrency=1 scripts/test-native-refresh-ci-layout.mjs scripts/test-native-refresh-ci-pack.mjs scripts/test-native-refresh-ci.mjs scripts/test-native-refresh-r9-stop.mjs:96/96,0fail/cancel/skip/todo,40081.6208ms. Only owned synthetic ZIP/SQLite/directories and intercepted build seams; no real build/sampling. No need repeat unchanged original ZIP tests after final peer-only fix.

node scripts/check-architecture.mjs:17projects PASS. Independent read-only review found workspace peer declaration lookup defect; fixed and peer/optional-peer regressions passed; reviewer confirms no remaining concrete P1/P2. Scoped format and whitespace checks before commit. No TS/Rust source changed, so no local compiler/build was required.

A broad first selector also selected3 original reader/materializer cases. They failed in the unchanged generator3 multi-version guard before reaching Native preparation; not retried or silently migrated. They remain blocked for the present installed dependency tree, and are not included in78/78. Original test expectations/defaults and frozen assets remain. This is not full replay generation/real qualification coverage.

Current metadata-only generator4 discovery refuses Invalid asset path because apps/mcp resolves SDK/zod into %LOCALAPPDATA%/Temp/codeatlas-sdk1322-Gikh9d/node_modules, outside this checkout. No accepted current graph/raw catalog was generated; no temporary SDK files were changed. The approved new format is tested in owned in-root trees. A controlled frozen install in an authorized isolated checkout and complete source/dist/tool closure are prerequisites for real qualification; not performed here. Do not publish this tree as ready, use temporary roots as production authority or weaken the new locator rule.

CI203 https://github.com/tim-zxy/CodeAtlas/actions/runs/42577112358 verifies old8831106 only:TypeScript/Rust success,Native oldR8 script prerequisite failure. New push gets its own automatic run; never reuse203 as its verification.

node --test scripts/test-workspace-structure.mjs:21/21,0fail/cancel/skip/todo,150.1116ms; mandatory registration and module/CI structure unchanged.

Author call-path review added actual workspace resolution checks (generator4 only), redirected-workspace refusal and explicit missing optional workspace evidence. Independent reviewer rechecked this delta with no remaining concrete P1/P2. Final topology14 includes those two controls; unaffected legacy record/PACK checks were reused by impact scope.
