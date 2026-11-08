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
