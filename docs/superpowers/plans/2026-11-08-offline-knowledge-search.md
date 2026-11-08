# Existing P1-15 lexical projection component

Goal: bounded SQLite FTS5 lexical search of OWNED_TEST_PUBLICATION head display fields only, not production search_knowledge or graph expansion. Existing knowledge-consumption section7 and P1-15 remain controlling.

Use a dedicated budgeted SQL projection, never readState/committed/command, because those materialize full snapshot/support/Claim bodies. Test permission manifest explicitly names all indexed item/revision IDs and permitted scope/freshness/currency/title/summary/goal fields. Denial/unknown/illegal async refuses before projected text delivery. Check before MATCH and again before result exposure. No DTO grants production access.

Index is derived in a new private in-memory SQLite connection and pins workspace, complete head identity set and projected-content digest. Publication heads changing yields INDEX_UNAVAILABLE until explicit rebuild. Source freshness AFFECTED is separately returned with warnings, not hidden or inferred fresh. Index rebuilding preserves old index on failure; never changes published history or triggers semantic update. No W011/schema/public API/dependency change.

Query is a literal FTS phrase (quotes escaped), built-in unicode61 tokenizer, bm25 then stable item/revision ID order. Explicit caller-provided maxResults and existing traversal/text/SQL budgets, no default numeric caps. Output includes truncation; only genuine successful zero hits returns empty. FTS unavailable/corrupt/stale and permissions are typed failures.

- [x] Implement dedicated authorized-field projection and permission/transaction ownership refusal.
- [x] Implement derived FTS5 component and actual self-owned data tests: pending hidden, phrases/tie order, affected warnings, budgets/truncation, permission before body, stale/rebuild and failed rebuild preservation.
- [x] Build affected packages, relevant publication/search tests, architecture and independent review; synchronize factual evidence once.

No user DB/body, Source/Claim scan, production permission/publication/quality, remote/model/embedding or Native/R9.

## Verification

Storage, downstream Runtime plus IR/Knowledge/Application builds passed. New10 search cases and all related prior tests108/108,0fail/skip:

`node --test --test-concurrency=1 packages/storage/test/offline-knowledge-search.test.mjs packages/application/test/offline-publication.test.mjs packages/storage/test/offline-publication-store.test.mjs packages/application/test/evaluation-record.test.mjs packages/storage/test/evaluation-record-store.test.mjs packages/knowledge/test/identity.test.mjs packages/knowledge/test/reconciliation.test.mjs packages/storage/test/compilation-input-store.test.mjs scripts/test-workspace-structure.mjs`

Architecture17 passed. Actual SQLite FTS5 tests cover deterministic rank/ties, explicit truncation/literal queries, pending exclusion, fields-only permission-before-SELECT, late revocation, failed rebuild retention, changed heads/rebuild without history mutation, unavailable/limits, async UNKNOWN stop, foreign transaction preservation, same-head corruption and consistent DRAFT/CANDIDATE corruption refusal. A large multibyte nonprojected Claim budget fixture asserts no JSON projection prepared before denial.

First Storage build exposed a never-return annotation error; corrected. Associated review found processing byte undercount/late JSON preflight and missing explicit published-state checks; fixed with independent fault cases, final review passed. A wiring error while adding Promise UNKNOWN was caught by9/10 then corrected; final10 and integrated108 passed.

CI187 at1d6b7e9 ended TS failure/Rust success/Native old R8 catalog failure. TS root cause: prior internal Knowledge dependency declaration had not been mirrored in the exact workspace test expectation. Local reproducer20/21 failed identically; added only that existing workspace dependency to expected map, preserving strict deepEqual and architecture allowlist. The previous98 local capture preceded the manifest update and must not be presented as verification of that exact committed head. This batch re-ran the exact corrected source/configuration successfully. No CI rerun triggered manually.
