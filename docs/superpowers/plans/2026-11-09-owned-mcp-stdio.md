# Owned MCP stdio Implementation Plan

> Execute inline under the user's existing authorization; independent evidence review before dependency adoption and final focused code review.

Goal: real SDK stdio -> unchanged approved BUSINESS Agent API in self-owned data; no production authority.
Spec: ../specs/2026-11-09-owned-mcp-stdio.md
Tech: Node24, existing pnpm11.19.0, SDK1.32.2, fast-uri3.1.9 and reviewed92-node offline closure.

- [x] Independently confirm unchanged tar/lock and provenance/closure/license evidence; retain fresh raw OSV92 response, immutable input/source hashes.
- [x] Prepare scoped offline lock/store using existing pnpm, reject graph drift, preserve predecessor dependency entries.
- [x] Write actual SDK child/stdin and memory transport tests first; observe missing server module RED. Cover exact schema+fixture, unsupported kinds/tools, no caller authority, cancel/close join, strict explicit budgets/concurrency and full frame limits.
- [x] Implement apps/mcp/src/owned-business-stdio.ts and export through main; expand app build include and exact dependency/test expectations. Keep ordinary CLI/smoke closed.
- [ ] Build affected app/Agent API; run focused old/new trace/CLI smoke and architecture/format/declaration gates; independent final review and association fixes. Update status/trace/authority and scoped commit/push; track exact automatic CI without reruns.

Review focus: schema union must not become empty; no unsafe context fields; no early settlement on ignored cancellation; no partial oversize writes; dependency/peer selection must exactly match reviewed identities without upgrading existing Zod.

## Evidence and rulings

Base a3d0a15, same D continuation worktree, one writer. Independent origin and age-policy reviews passed; final code review found output drain-only hang and fixture cleanup defects, both fixed with associated reproductions and no remaining blocker. Immutable raw audit and full local test log reside in .superpowers/sdd/2026-11-09-owned-mcp-stdio; portable public-source/hash/OSV evidence is docs/superpowers/reviews/2026-11-09-sdk1322-audit.json.

Initial module-only RED: undefined vs function. First protocol run6/7 caught DEADLINE serialized under expired controls; static typed failures now serialize without reusing cancelled work accounting, while successful bodies retain full validated measurement. First build found SDK HeadersInit missing in Node-only libs and duplicate Zod4.6.1/4.6.7 class types; app-local DOM typing and Agent-API-owned JSON schema generation fix the cause, no skipLibCheck/cast relaxation.

Backpressure-only test first RED(true settlement before write) led to joining actual sends. Independent output-error test then RED(PENDING) exposed the SDK drain-only defect; Node write callback/error/close plus official serializer now settles UNKNOWN without a leaked drain listener. A fixture initially called a write callback twice in finally and another waited the client's60s default timeout; cleanup is idempotent and client ConnectionClosed is now asserted explicitly. Original logs/results are retained, not counted as green. Final associated4 tests plus independent destroy-without-callback check passed.

Dependency candidate: first pnpm flags unsupported; npm_config_offline environment was ignored and mirror metadata was read(downloaded0), wrong jose6.2.15 candidate abandoned. Explicit --config.offline=true uses full unmodified local packuments, parent-specific jose6.2.16/fast-uri3.1.9 pins and pnpm11's exact single-version age exception. Actual92 identities/integrities match the reviewed NPM input; existing package/snapshot entries are unchanged. No broad age/strict/trust setting was changed.

PNPM11.19.0 whole17-workspace frozen lock-only verification in a clean manifest projection passed186 supply-chain entries with explicit offline/ignoreScripts. Parsed lock remained identical; pnpm normalized text formatting, recorded separately rather than claimed byte-identical. Existing cached pnpm was used; no extra package manager/software was installed. Actual new modules are links to the fully verified disposable offline installation, not placeholder packages.

Fresh builds(exit0):
node node_modules/typescript/bin/tsc -p packages/agent-api/tsconfig.json
node node_modules/typescript/bin/tsc -p apps/mcp/tsconfig.json

Final64/64,0fail/cancel/skip/todo,11712.3171ms:
node --test --test-concurrency=1 apps/mcp/test/owned-business-stdio.test.mjs apps/mcp/test/smoke.test.mjs packages/agent-api/test/business-trace.test.mjs packages/knowledge/test/offline-business-trace.test.mjs packages/application/test/offline-business-trace.test.mjs scripts/test-workspace-structure.mjs

node scripts/check-architecture.mjs passed17 projects. Scoped Prettier and git diff --check pass. The11 new tests cover actual official SDK child calls and schema, unavailable selectors/tools, permission/context refusal, full token cap/deadline, concurrency/cancel, oversized frames, joining ignored provider work, exact explicit host limits, backpressure and output-failure UNKNOWN. The existing synthetic counter37 is not a tokenizer. No normal production fixture mode or six-tool readiness is added.

CI193 exact a3d0a15 terminal TS/Rust success; Native old R8 prerequisite failed, actual qualification skipped. New source requires its own normal automatic run. No real model/scanner, user data/database, production query/publication, Native/R9 or phase acceptance. Phase1 remains4/21, A6 NOT_QUALIFIED, E02 PROPOSED/uninstalled.
