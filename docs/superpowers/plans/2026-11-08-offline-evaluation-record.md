# Approved bounded Evaluation record implementation

Goal: bind actual structurally validated candidates to workspace/run/snapshot and fixed rule version, using self-owned data only.
Architecture: private IR format/recomputation, Application structural evaluator, Storage record experiment. No public exports, W011 installation or publication. Existing snapshot format and production manifests stay unchanged.

Implementation choice: a separate test-owned SQLite record database avoids adding objects to the exact W009/W010 snapshot schema. It is an experiment, not a production storage-layout decision or cross-database atomicity claim. Storage rereads the genuine CompilationInputStore and validates complete immutable snapshot/candidate bindings.

Record binds schemaVersion, evaluationId, workspaceId, runId, snapshotId, revisionSetId, inputDigest, full snapshotDigest, candidateDigest, fixed ruleRef, executionKind PURE_CONTRACT, structuralResult VALID, quality NOT_EVALUABLE, publication NOT_AUTHORIZED. Candidates are validated using the snapshot's actual scoped entity/support context; duplicate IDs, differing snapshot refs/scope and empty sets refuse. No caller status or threshold input.

- [x] Add independent input/record tests; observe missing-module RED.
- [x] Implement private IR + Application + Storage; existing bounded canonical validation and SQL budgets reused.
- [x] Verify actual owned persistence/reopen, record/candidate/snapshot substitution, duplicate IDs, cancellation/budgets and immutable record behavior.
- [x] Build IR/Storage/Application/Runtime, targeted tests, architecture/format; independently review final diff.
- [x] Record exact evidence/limits and sync once.

No user DB, real model, quality baseline, scan clearance, production schema or writer authority. Unavailable validation refuses; no automatic retry or quality admission.

## Verification

IR, Storage, Application and downstream Runtime builds passed. New9 plus existing23 =32/32,0fail/skip:

`node --test --test-concurrency=1 packages/application/test/evaluation-record.test.mjs packages/storage/test/evaluation-record-store.test.mjs packages/storage/test/compilation-input-store.test.mjs packages/storage/test/offline-reviewed-snapshot.test.mjs packages/application/test/integration-candidate.test.mjs`

Initial missing-module RED1/2; actual validation then exposed omitted support entities in reference context, fixed using the established mapping including document captures. Control descriptor TS optional-value annotation corrected. Independent review found callback run substitution, lost commit acknowledgement and unfixed local SQL view; associated regression tests and final review passed. Tests include real WAL concurrent replacement and actual COMMIT-then-throw, not mocked PASS. Architecture17 passed. Exact private format: ../specs/2026-11-08-offline-evaluation-record.md. No W011, production quality or parent acceptance claim.
