# Owned BusinessFlow Trace Implementation Plan

Goal: exact published BusinessFlow -> bounded forward/backward step trace with support and freshness, no inferred edges.
Files: Knowledge offline-business-trace.ts, Application offline-business-trace.ts, focused independent tests; extract the existing published-selection validator within offline-wiki.ts for reuse, preserving renderer behavior. Spec: ../specs/2026-11-08-owned-business-trace.md.

- [x] Independent RED tests: literal branch/merge/cycle graph, backward original edge orientation, explicit frontier under each budget, malformed membership/scope/reference/type and cancellation; preserve affected metadata.
- [x] Reuse existing published-selection validation without invoking Wiki rendering; implement exact-query Application owner and pure deterministic Knowledge traversal.
- [x] Integrate actual self-owned Store query (wrong-type refuses without writes); fixed query binding, late cancellation and permission errors cannot yield a partial success. No public route.
- [x] Minimal sufficient associated builds/tests, existing Wiki regression after validator extraction, independent review, architecture/format and factual trace/status synchronization; commit/push only this batch and reuse CI191.

All limits caller-explicit, no new token formula or numerical reservation. Only declared BusinessFlow step links inside one published revision, never runtime execution or cross-flow inference. Synthetic positive records are not production publication or quality evidence. Keep original phase gates open.

## Verification

Both new API modules were absent when the independent tests were run (API-absence RED). The existing published-selection validator was extracted in-place from Wiki without invoking its profile/renderer; the original16 Wiki tests passed before adding trace. Initial11 trace cases passed, then related159/159 passed but the formatting check flagged the new Knowledge file. Independent review found that historical selected revisions could lose known current-head state when query warnings were empty. The new history case was observed7/8 RED; trace now includes currentHeadRevisionId/isCurrentHead and generates the history warning from IDs, without changing exact selection or stored freshness/currency. Final focused review reports that association closed with no remaining specific finding.

Fresh affected builds: Knowledge, Application, Storage and downstream Runtime, using node node_modules/typescript/bin/tsc -p packages/<name>/tsconfig.json, exit0. Final160/160 integrated tests,0fail/cancel/skip/todo,17314.1319ms:

node --test --test-concurrency=1 packages/knowledge/test/offline-business-trace.test.mjs packages/application/test/offline-business-trace.test.mjs packages/storage/test/offline-wiki-files.test.mjs packages/knowledge/test/offline-wiki.test.mjs packages/application/test/offline-wiki.test.mjs packages/storage/test/offline-published-knowledge.test.mjs packages/storage/test/offline-knowledge-search.test.mjs packages/application/test/offline-publication.test.mjs packages/storage/test/offline-publication-store.test.mjs packages/application/test/evaluation-record.test.mjs packages/storage/test/evaluation-record-store.test.mjs packages/knowledge/test/identity.test.mjs packages/knowledge/test/reconciliation.test.mjs packages/storage/test/compilation-input-store.test.mjs scripts/test-workspace-structure.mjs

Architecture17 and exact source/test/package formatting pass. New12 tests cover diamond/merge/cycle, backwards original edges/minimum depths, permutation-stable output, each traversal frontier, full UTF8 metadata byte boundary, exact revision/type/scope/digest/provenance refusal, unavailable/permission/late cancel, affected/partial retention and explicit historical metadata. Positive BusinessFlow records are synthetic fixtures, not real production publication or quality proof. The actual self-owned publication Store integration reads a real INTEGRATION and correctly refuses BUSINESS coercion; all four canonical experiment tables remain byte-equivalent.

CI191 exacta75fb50 completed: TypeScript/Rust success; Native failed old R8 script catalog prerequisite, actual qualification skipped. No duplicate run. The next automatic CI verifies this commit separately. No public trace_flow/MCP/token/ResultMeta adapter, source access, model, user DB, production query/publication or Native/R9 is enabled. Phase1 remains4/21, A6 NOT_QUALIFIED, E02 PROPOSED/uninstalled; original Agent API/trace quality gates remain OPEN.
