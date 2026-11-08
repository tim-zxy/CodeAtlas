# Existing P1-15 exact published-version reader

Goal: read complete selected owned-test published Knowledge Item/Revision records after lexical hits, without opening production query or defining Wiki required-section/status policy. Existing KnowledgeRevision/reference schemas and knowledge-consumption sections5/7 control.

Read exactly nonempty unique itemId/revisionId pairs, including historical receipt-backed PUBLISHED versions; never silently substitute latest. Separately report observed current head and isCurrentHead. All selected records must pass current explicit TEST_KNOWLEDGE_READ_NOT_AUTHORITY field checks; any denied/missing/corrupt member refuses whole selection.

Dedicated parameterized SQL projection returns selected item/revision, original candidate coverage and provenance only. Never readState/committed/command, whole snapshots or stateBinding.claims. Reference context is looked up from that record and pruned to metadata actually needed by its authorized revision; no unrelated candidate inventory. Raw UTF8 JSON input budgets precede source JSON processing in one owned read transaction. No lookup grants source bodies.

- [x] Observe API-absence RED on independent real owned-publication test setups.
- [x] Implement private strict exact-version reader with original shared SQL/control budgets and permission/transaction ownership refusal.
- [x] Verify current/historical selections, coverage/source binding, no partial/pending/foreign scope leaks, trimmed refs, permission-before-body, corruption, cancellation and UNKNOWN.
- [x] Build impacted packages, targeted related tests, architecture and independent review; synchronize factual evidence once.

Output is OWNED_TEST_PUBLICATION / quality NOT_EVALUABLE / productionQuery NOT_AUTHORIZED. Stored freshness/currency are not live observations. No user DB, Source/Claim body, real model, W011, production query/publication or Native/R9.

## Reproducible evidence

Independent API-absence RED8/8 used actual owned publication fixtures. Initial implementation6/8 exposed missing deep freezing and fixture expectations omitting the required stored AFFECTED warning. Corrected without suppressing freshness warnings. Review found mismatched candidate coverage and incomplete prior-chain bindings; SQL now binds candidate type/scope/importance/content/support/snapshot plus exact entry/item/revision, prior pointer/operation/receipt and same-item predecessor. Two independent corruption cases reject. Final focused review reported no remaining material finding.

Five builds passed: node node_modules/typescript/bin/tsc -p packages/{ir,knowledge,storage,application,runtime}/tsconfig.json (run individually). Integrated118/118 passed with new10 reader cases using:

node --test --test-concurrency=1 packages/storage/test/offline-published-knowledge.test.mjs packages/storage/test/offline-knowledge-search.test.mjs packages/application/test/offline-publication.test.mjs packages/storage/test/offline-publication-store.test.mjs packages/application/test/evaluation-record.test.mjs packages/storage/test/evaluation-record-store.test.mjs packages/knowledge/test/identity.test.mjs packages/knowledge/test/reconciliation.test.mjs packages/storage/test/compilation-input-store.test.mjs scripts/test-workspace-structure.mjs

After the final exact-entry refinement and new publication->actual FTS5 hit->exact-version read integration, Storage/Runtime builds and the following31/31 passed (new reader11 included,0fail/skip):

node --test --test-concurrency=1 packages/storage/test/offline-published-knowledge.test.mjs packages/storage/test/offline-knowledge-search.test.mjs packages/storage/test/offline-publication-store.test.mjs

The integration compares all four publication tables before/after. The tests also cover history/current-head separation, pruned context, original coverage, missing/pending/foreign scope, denied-before-body and late revocation, corruption, control/limits and Promise UNKNOWN. Architecture check passed for17 projects. Initial default-sandbox build could not write dist and also exposed a local permission callback type annotation; normal scoped escalation build succeeded after correcting the type, without ACL changes.

CI188 at exact2c4b8bd: TypeScript and Rust success, Native failure at approved script catalog prerequisite; later real Native qualification steps skipped. No rerun/manual dispatch. Prior commit's green TS is not verification of this new commit. Phase1 stays4/21; full P1-15/Wiki/public query and original quality gates remain open.
