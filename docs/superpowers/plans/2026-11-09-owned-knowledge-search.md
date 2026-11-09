# Owned knowledge search Implementation Plan

Execute inline under existing user approval; single integrator, final independent associated review.
Goal: real self-owned SQLite publication -> typed filtered FTS first page/evidence -> Application -> Agent API -> official MCP SDK.
Spec: ../specs/2026-11-09-owned-knowledge-search.md

- [x] RED: storage filter-before-limit and real projected evidence; Agent strict schema/session and literal metadata/control vectors; real SDK second-tool protocol.
- [x] Extend only existing offline Store projection/index, preserving legacy calls; add narrow type/coverage/support/provenance binding, strict filtered search page.
- [x] Add Application fixed read-port composition and versioned owned Agent session using existing exact counter/control patterns. Wire optional session through existing SDK lifecycle; preserve BUSINESS-only mode.
- [x] Build Storage/Application/Agent/Runtime/MCP; integrated affected tests, architecture17, scoped format and independent associated review.
- [x] Sync current status, trace, ADR020/API extension, exact scoped commit/push; monitor automatic CI without rerun.

Review focus: filters before limit; no denied-field/body read; evidence bound to exact revision/command/candidate; honest mixed/empty metadata; complete byte/token measurement; late revocation/cancel and session close; unsupported scope/cursor cannot widen authority. No user data or production query, no complete P1-17/18 acceptance.

## Evidence and failures

Initial API absence RED: storage searchPage and Agent session undefined,2/2 fail. First implementation caught v2 type digest missing from recheck and old fixture lacking new metadata permission; corrected consistently,11/11 search tests passed. First Agent build caught leftover copied type name and DocumentBasis scope not directly present; document metadata is now tied to actual workspace DOCUMENT scoped refs. The actual synthetic fixture repository is r, not r1/r2; correcting the fixture fixed DATA_INVALID without weakening scope checks.

A proposed mixed Component fixture correctly refused SERVICE as an implementation entity; BusinessFlow likewise required real RuntimeFlow refs. These malformed test setup attempts were replaced by a derived-only FTS fault row, proving SQL type filtering precedes LIMIT without inventing canonical publication. No invalid record is admitted.

Independent review found post-MATCH checks only compared heads. Safer pure projection-return fault injection(no SQL trigger/data change) reproduced Missing expected exception, then full canonical before/after record checks fixed it for search/rebuild. The reviewer's separate trigger-mutation reproduction was denied under its read-only assignment and did not execute or retry; the safer test covers the gap. Associated review reports no remaining P1/P2 blocker. Strict response cross-field tests also failed before adding exact basis/aggregate/truncation/warning associations.

First integrated87:86 passed,1 failed because the exact Agent export inventory still named only BUSINESS. Updated only the exact expected approved search exports, preserving strict equality. Original log retained at .superpowers/sdd/2026-11-09-owned-knowledge-search/integrated-tests.log. Final evidence follows after verification.

Build commands(all exit0): node node_modules/typescript/bin/tsc -p packages/storage/tsconfig.json; same for packages/application,packages/agent-api,packages/runtime,apps/mcp. No Native/R9, installation, new dependency or package fetch.

Affected integration command: node --test --test-concurrency=1 packages/storage/test/offline-knowledge-search.test.mjs packages/storage/test/offline-published-knowledge.test.mjs packages/agent-api/test/knowledge-search.test.mjs packages/agent-api/test/business-trace.test.mjs apps/mcp/test/owned-knowledge-search.test.mjs apps/mcp/test/owned-business-stdio.test.mjs apps/mcp/test/smoke.test.mjs scripts/test-workspace-structure.mjs

Existing CI194 on529458e is terminal TS/Rust success, Native old R8 script catalog prerequisite failure; actual qualification skipped. This batch requires its own automatic CI and cannot borrow194's result.

Final integration87/87,0fail/cancel/skip/todo,23438.2597ms; final-tests.log retained locally. Architecture17 and5 builds passed. Independent associated review approves the fixed post-MATCH/rebuild comparisons and safer regression, no remaining concrete P1/P2 blocker. Scoped Prettier and whitespace checks are required before exact-file commit. Stage/phase acceptance is unchanged; the checked delivery step denotes this scoped batch and subsequent automatic CI monitoring, not a green Native or phase.
