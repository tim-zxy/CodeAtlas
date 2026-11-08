# Offline compilation inspection implementation plan

> Single integration writer; separate implementation and read-only review.

**Goal:** In self-owned temporary tests only, verify pre-read inventory, each
permission, exact bytes/inspection and fixed same-payload consumption.
**Architecture:** Private Application one-shot owner/ports reusing current capture
validators and deny-only original inspection. No production adapter or grants.
**Spec:** ../specs/2026-11-08-offline-compilation-inspection.md
**Tech stack:** Existing Node/TypeScript/temporary files; no dependency.

## Integrated batch
- [x] Implement private owner and tests in new Application files; no existing
  production denial change. Red/green sequencing, mismatch/secret/cancel/UNKNOWN.
- [x] Verify full payload and pre-read metadata binding; sticky consumer outcomes
  and mandatory cleanup; review callback/data distinctions independently.
- [x] Register once, build Application, run affected scanner/capture/consumer tests,
  architecture and formatting. Update evidence/trace; exact-stage and sync once.

## Verification

Application `node node_modules/typescript/bin/tsc -p packages/application/tsconfig.json`
passed. Integrated command:

`node --test --test-concurrency=1 packages/application/test/offline-compilation-inspection.test.mjs packages/application/test/compilation-input.test.mjs packages/application/test/document-write-preflight.test.mjs packages/application/test/parsed-document-write-preflight.test.mjs packages/documents/test/secret-preflight.test.mjs scripts/test-workspace-structure.mjs`

128/128,0fail/skip. New12 are included, not additional. Initial5/6 exposed an
aborted-before-creation test setup error; abort-after-create verifies mandatory
settlement. Independent findings fixed with map/bytes mutation, invalidation
UNKNOWN, malformed metadata and true post-settle revocation regressions. Final
associated review no Critical/Important. Architecture17, named Prettier and
`git diff --check` pass. No production policy or governing document change.

## Complete persisted review slice

Added only packages/storage/test/offline-reviewed-snapshot.test.mjs plus mandatory
registration and evidence records. Reuses the approved owned snapshot Store with
real temporary schema9/10 SQLite, actual raw tempfile inspection and actual local
double invocation; no new product wrapper. Happy path closes/reopens and checks
full payload hash, exact support SQL rows, CAPTURING/nullfinish and zero Knowledge/
publication rows. Lost real snapshot COMMIT ack and acknowledged commit followed
by cleanupUNKNOWN both retain commit separately, stop generation and prohibit
repeat puts/automatic continuation. Shared original control spans the whole slice.

`node --test --test-concurrency=1 packages/storage/test/offline-reviewed-snapshot.test.mjs packages/storage/test/compilation-input-store.test.mjs packages/application/test/offline-compilation-inspection.test.mjs packages/application/test/integration-state-test-double.test.mjs packages/knowledge/test/identity.test.mjs packages/knowledge/test/reconciliation.test.mjs scripts/test-workspace-structure.mjs`

93/93,0fail/skip. New3 included; independent review no Critical/Important.
Strengthened support SQL expectation corrected from raw value to full stored
CapturedSupport envelope after2pass/1failure; final new3 and merged93 passed.
No product source change, new build, permission/schema/admission/authority or
formal acceptance change. Existing unchanged build/architecture evidence reused.
