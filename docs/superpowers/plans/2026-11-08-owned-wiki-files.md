# Owned Wiki Files Implementation Plan

Goal: persist and reopen real owned Wiki artifacts using existing Phase1 copy-on-write lifecycle, not another memory wrapper.
Files: private Storage knowledge/offline-wiki-files.ts and associated tests; no public index/dependency or Application API changes. Spec: ../specs/2026-11-08-owned-wiki-files.md.

- [x] Write independent actual-files tests using fresh owned temporary roots; observe absent API RED.
- [x] Implement fresh-root factory, bounded identity-checked readers and exclusive immutable revision/current writer; preserve UNKNOWN, CAS and prior data.
- [x] Integrate actual owned OfflineWikiProjector output in test, reopen files, preserve previous revision, test actual write/rename failures and conflict/limits/links; do not manipulate user data.
- [x] Independent focused review; affected builds, related Wiki/search/publication tests, architecture/format, exact facts/trace update and scoped commit/push. Reuse CI190; no manual dispatch.

No production outputTarget, permissions/ACL, user DB, model, Native/R9, profile or numeric changes. maxArtifactBytes is caller-explicit logical file budget, not a new resource reservation or hard physical bound. Failures remain evidence; no cleanup of unknown directories.

## Verification and retained failures

API-absence RED was observed before product code. Initial actual-file cases7/7 passed. Focused review found that rename ACK was being delayed until readback; corrected to preserve COMMITTED immediately after confirmed rename and separate later cleanup UNKNOWN. Added actual rename-before-throw/rename-after-throw, acknowledged-rename cancellation, lock unlink and temporary-fd close ACK-loss tests. A follow-up guard-order error produced11/12 and was fixed, keeping ARTIFACT_WRITER_BLOCKED priority. Initial integrated147/148 exposed old-instance inspection incorrectly depending on a lock whose unlink actually succeeded; fixed readonly blocked-instance inspection without enabling writes. Explicit reopen inspection is now required before writing an existing current directory, and retained pending/lock prevents recovery. The former UNKNOWN owner remains blocked. Final associated review reports no remaining concrete blocker; no tombstone architecture was added.

Fresh Storage build and downstream Runtime build exit0. Final148/148,0fail/cancel/skip/todo,16248.4524ms:

node --test --test-concurrency=1 packages/storage/test/offline-wiki-files.test.mjs packages/knowledge/test/offline-wiki.test.mjs packages/application/test/offline-wiki.test.mjs packages/storage/test/offline-published-knowledge.test.mjs packages/storage/test/offline-knowledge-search.test.mjs packages/application/test/offline-publication.test.mjs packages/storage/test/offline-publication-store.test.mjs packages/application/test/evaluation-record.test.mjs packages/storage/test/evaluation-record-store.test.mjs packages/knowledge/test/identity.test.mjs packages/knowledge/test/reconciliation.test.mjs packages/storage/test/compilation-input-store.test.mjs scripts/test-workspace-structure.mjs

The new13 include an actual OfflineWikiProjector artifact, restart/reopen reads, unchanged byte stability, version history, CAS and immutable conflict, byte/cancel refusal, foreign owner/path receipt, both uncertain rename outcomes with persistent blocking, known commit/cleanup separation, fd close ACK loss, real hardlink and Windows directory junction refusal. Filesystem hooks restore in finally; the close hook first really closes the fd and leaves no test-fd leak. Owned temporary roots/aliases are retained as small evidence; no existing directory was moved or recursively deleted.

node scripts/check-architecture.mjs passes17 projects; exact source/test/package Prettier check passes. No production outputTarget, hostile-process path-stability proof, power-loss/directory-fsync durability, secret clearance, quality admission, user DB or Native/R9 result is claimed. Storage validates file ownership/format/digests only; Application still owns semantic/permission validation.

CI190 exactff30ec0 ended TypeScript/Rust success; Native failed old R8 script catalog prerequisite and actual qualification skipped. No duplicate dispatch or rerun. A later automatic CI must verify this new commit; predecessor green TS is not new-HEAD evidence. Phase1 remains4/21, A6 NOT_QUALIFIED, E02 PROPOSED/uninstalled; formal Wiki/production gates remain open.
