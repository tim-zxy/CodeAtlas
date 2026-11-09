# BUSINESS Public Contract Implementation Plan

Goal: v1 BUSINESS arguments -> server-owned authorization/exact query -> complete bounded response, in owned data only.
Spec: ../specs/2026-11-09-business-trace-public-contract.md. Node24/TypeScript/current Zod4.6.1 only; no SDK/tokenizer installation.

- [x] Independent fixtures/tests first for strict arguments/responses, unsupported kinds, opaque context/server authorization, counter absence/estimate/digest/policy/integer failures, exact full-envelope byte/token limits, revocation/cancel/close and unavailable/data errors; observe API-absence RED.
- [x] Add packages/agent-api/src/business-trace-contract.ts and business-trace-tool.ts; export via index; declare only existing internal workspace/Zod dependencies and exact test expectations. Reuse Application tracer export and existing control/schema parsers; add original flow support metadata.
- [x] Integrate explicit synthetic published positives and actual owned Store type-refusal/no-write case; no production context issuer, data, model or SDK. Test counter doubles stay visibly owned-only.
- [x] Build affected packages and declarations, run minimum sufficient old/new trace/Wiki/Store/architecture/format gates; focused independent review and association fixes only.
- [ ] Synchronize controlling Agent spec, authority/acceptance references, literal baseline, status/trace and reproducible failures; exact scoped commit/push under existing permission, monitor the new automatic CI without reruns.

Success requires no client-supplied authority/token counts, no guessed tokens, preserved exact historical Knowledge version and explicit truncation/support/basis/freshness. Missing reliable server counter must not call query. Close/recreated-session handles cannot revive. Unknown callback work invalidates the session. No six-tool/MCP/quality completion claim.

## Reproducible verification, 2026-11-09 UTC

Base: 127ae32a7c31bb990841cb63b78b3167d179e113, continuation branch in
D:\workspace\CodeAtlas-phase1-20261106. Independent literal request/expected
fixtures were authored first: API-absence RED reported missing named schema export.
Initial TypeScript control-flow/callback typing errors were corrected before tests.
First16-case run was15pass/1fail because late cancellation surfaced the existing
Knowledge control-stop message instead of public CANCELLED; only the known control
message codes are now mapped, not raw errors. The COMPLETE coverage metadata-mutation
test also sets PARTIAL so it remains a valid IR input; no validator was relaxed.

Affected builds, all exit0:

node node_modules/typescript/bin/tsc -p packages/knowledge/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/application/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/agent-api/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/storage/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/runtime/tsconfig.json
node node_modules/typescript/bin/tsc -p apps/mcp/tsconfig.json

Integrated176/176,0fail/cancel/skip/todo,19329.7018ms:

node --test --test-concurrency=1 packages/agent-api/test/business-trace.test.mjs packages/knowledge/test/offline-business-trace.test.mjs packages/application/test/offline-business-trace.test.mjs packages/storage/test/offline-wiki-files.test.mjs packages/knowledge/test/offline-wiki.test.mjs packages/application/test/offline-wiki.test.mjs packages/storage/test/offline-published-knowledge.test.mjs packages/storage/test/offline-knowledge-search.test.mjs packages/application/test/offline-publication.test.mjs packages/storage/test/offline-publication-store.test.mjs packages/application/test/evaluation-record.test.mjs packages/storage/test/evaluation-record-store.test.mjs packages/knowledge/test/identity.test.mjs packages/knowledge/test/reconciliation.test.mjs packages/storage/test/compilation-input-store.test.mjs scripts/test-workspace-structure.mjs

Independent review found two association issues: provider rejection after abort/
deadline lost its control outcome; Promise species observer failure could occur
before permanent context invalidation. Query catch now rechecks actual control;
session closes before observation and preserves safe errors when observation fails.
Final affected18/18,0fail/skip,492.608ms:

node --test packages/agent-api/test/business-trace.test.mjs

Agent API rebuilt after fixes; independent associated3/3 passed with no remaining
specific blocker. It covers normal rejected Promise, cancelled/expired rejecting
query and frozen resolved poisoned-species Promise. Rejected exotic host promises
remain incapable of standard reliable observation; the contract explicitly excludes
a host work-settlement/unhandled-rejection guarantee for that invalid provider,
without mutating the object or global policy. No runtime fallback is introduced.

node scripts/check-architecture.mjs passed17 projects. Scoped Prettier check
passed for all eleven changed product/test/package/lock paths. git diff --check
passed. The already-installed Zod/App/IR packages were linked locally only after
exact target checks; no package installer/network/script or new dependency version.
Strict workspace dependency/index assertions were updated to exactly these edges,
not widened. Mandatory root tests register the new test once.

The public positive reads self-owned in-memory SQLite fixture rows; literal declared
BusinessFlow data is synthetic, and counter37 is visibly a fixture policy double.
Existing actual owned Store INTEGRATION-to-BUSINESS refusal checks unchanged canonical
rows. No actual tokenizer, production principal/route, SDK, user DB/source, publication,
model, scanner or Native/R9 run. CI192 (42502889591) terminal at prior127ae32:
TS/Rust success; Native old R8 catalog prerequisite failed, actual qualification skipped.
Next push must be monitored as a new exact-head run, never inherit that prior result.
Phase1 remains4/21, A6 NOT_QUALIFIED, E02 PROPOSED/uninstalled.
