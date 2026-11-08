# Approved self-owned publication experiment

Goal: refine and verify complete-set, opaque IDs, idempotency, atomic heads/receipt and unknown outcomes using self-owned temporary SQLite only. Not production W011 or quality admission.

Application reads the complete actual current head comparison set; existing Reconciliation and fingerprint policy decide actions. NEW/UPDATE review requirements remain; an explicit TEST_REVIEW_NOT_AUTHORITY port is used only in owned tests, never human/production approval. No subset, MERGE/SPLIT/DEPRECATE, unresolved review, or intra-set reference rewriting.

Application allocates random opaque item/revision IDs once per prepared command; NEW uses new item+revision, UPDATE retains exact planned item/head. A logical request digest excludes newly allocated IDs/time, while command digest includes them. Committed same logical key returns original IDs/receipt; pending/uncertain attempts are inspection-only. Logical identity also excludes mutable prior-state/plan digests, retaining full subjects/state evidence.

Private IR format validates command shape, candidates/evaluation, item/revision headers and exact complete membership. Storage depends only on IR and checks old full-state digest under lock; it never chooses identity. Independent test DB uses experimental tables, not canonical workspace migrations or a production layout decision.

Durable attempt is registered before publication; opaque same-process ownership controls execution. All revisions, receipt and final head CAS are in one transaction. Lost acknowledgement/uncertain cleanup blocks execution. New owner can only inspect existing attempts, never revive them; absence does not prove prior noncommit. Original settled rollback can prove NOT_COMMITTED; no automatic retry.

- [x] Write/run missing behavior tests.
- [x] Implement private IR format, Application preparation and Storage transaction experiment.
- [x] Verify complete scope, duplicate requests, changed inputs, head race, injected rollback, COMMIT acknowledgement loss and restart inspection using owned data.
- [x] Build affected packages, targeted prior tests and architecture; independent associated review.
- [x] Record evidence/limits and sync once.

Rollback disables new experimental entry and preserves history. No user DB/body, production publication, model, W011/FTS migration, thresholds, installed helper or Native/R9 changes.

## Verification

New Application9 and Storage10 passed, including actual latest-state retry before re-review, two distinct candidates with second revision fault/all-row rollback, actual COMMIT-then-throw, registration-ACK loss/no owner resurrection, acknowledged-commit/cleanupUNKNOWN, head race, immutable earlier revision and wrong issuer/naked command refusal.

Five builds IR/Knowledge/Storage/Application/Runtime passed using node node_modules/typescript/bin/tsc -p packages/<package>/tsconfig.json. Integrated98/98,0fail/skip:

`node --test --test-concurrency=1 packages/application/test/offline-publication.test.mjs packages/storage/test/offline-publication-store.test.mjs packages/application/test/evaluation-record.test.mjs packages/storage/test/evaluation-record-store.test.mjs packages/knowledge/test/identity.test.mjs packages/knowledge/test/reconciliation.test.mjs packages/storage/test/compilation-input-store.test.mjs scripts/test-workspace-structure.mjs`

Independent review found dynamic request identity/retry and naked-command substitution defects; stable lookup-first identity and fixed opaque origin closed them, associated review passed. Snapshot context/state closure was strengthened. First Storage build found readonly tuple typing; fixed. Initial combined command's98 tests passed but architecture failed undeclared existing internal Knowledge dependency. Added only @codeatlas/knowledge workspace:* to Application and link:../knowledge importer to lock; no external dependency/download/version change. Final architecture17 and changed-source/package/lock Prettier/diff checks pass. YAML Prettier parsed the lock; standalone yaml package was unavailable. No invented pre-implementation RED is claimed. CI186 at48e1512 ended TS/Rust success, Native old R8 catalog failure. New commit requires its own CI result.

### Exact-head evidence correction

CI187 proved the previous98-test capture preceded the later internal dependency manifest update; its strict workspace expectation was not rerun afterward. The committed1d6b7e9 therefore had a real TypeScript test regression, not just Native's old catalog issue. The next search batch restores exact expected Application->Knowledge dependency and reruns108 related cases plus architecture17; see2026-11-08-offline-knowledge-search.md. Original failure evidence is retained.
