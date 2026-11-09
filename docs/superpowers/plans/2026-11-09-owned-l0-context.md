# Owned L0 context Implementation Plan

Execute inline under existing user approval, one integrator and final independent review.
Goal: explicit current published metadata -> Application -> strict L0 Agent -> official SDK stdio on self-owned data.
Spec: ../specs/2026-11-09-owned-l0-context.md

- [x] RED: exact selected metadata projection, no broad reads, limited L0 schema/session API and real SDK route.
- [x] Reuse Store projection with an exact selection SQL restriction; add App fixed metadata reader, L0 contract/session. No FTS/auto search/body or new permission.
- [x] Reuse SDK bounded lifecycle through separate single-tool factory; validate old Business/search compatibility, L0 missing/truncated metadata, precise source/fallback, context/permission/control/token failures.
- [x] Affected builds/tests/architecture/format and independent associated review; sync current status/trace/ADR/API, exact scoped commit/push, monitor existing195 and new automatic CI.

Review focus: no unselected display read, historical/current mismatch honesty, empty does not imply whole project, disjoint selected/returned/missing/omitted refs, complete output budgets and revocation/cleanup. No Source/model/userDB/production access, no new core identity semantics.

## Fresh evidence and retained failures

Initial Store/Agent APIabsence2/2 RED, then exact selected Store1 GREEN. Agent first10 had1 null-prototype SQLite test comparison failure, normalized fixture rows to plain DTOs; guards unchanged. Literal goal/NONE fallback fixture initially tried to mutate frozen returned records; copied test data instead. First integrated100 had99 PASS/1 fixture failure, retained in .superpowers/sdd/2026-11-09-owned-l0-context/integrated-tests.log.

Final100/100,0fail/cancel/skip/todo,25981.3791ms in final-tests.log.
node --test --test-concurrency=1 packages/storage/test/offline-knowledge-search.test.mjs packages/storage/test/offline-published-knowledge.test.mjs packages/agent-api/test/project-context.test.mjs packages/agent-api/test/knowledge-search.test.mjs packages/agent-api/test/business-trace.test.mjs apps/mcp/test/owned-project-context.test.mjs apps/mcp/test/owned-knowledge-search.test.mjs apps/mcp/test/owned-business-stdio.test.mjs apps/mcp/test/smoke.test.mjs scripts/test-workspace-structure.mjs

Build node node_modules/typescript/bin/tsc -p <project>/tsconfig.json for packages/storage,packages/application,packages/agent-api,packages/runtime,apps/mcp: all exit0. Final Agent/MCP rebuild followed direct-literal error-map cleanup (unused index-only error removed). Architecture check node scripts/check-architecture.mjs passes17 projects. Scoped formatting and Git whitespace checks apply before exact-file commit. Independent reviewer read SQL/port/schema/SDK/test changes with no P1/P2 blocker, no DB mutations or test run.

Source Store headers/text/evidence all restrict exact selection in SQL; complete canonical source comparison spans both reads. Agent self-owned helpers close the unrelated FTS test index before L0 execution and prohibit its search method, proving the L0 path is not a lexical workaround. Missing current version says SELECTED_CURRENT_REVISION_UNAVAILABLE, not global nonexistence; selected/returned/missing/omitted are precise. The fixture37 counter is enforcement evidence only.

Existing CI195 atfca8ca1 terminal TS/Rust success, Native old R8 script prerequisite failure, actual qualification skipped. New batch requires its own automatic CI; no manual rerun. All current production/client/Source/model/database/Native/R9 and original acceptance boundaries remain.
