# Read-only schema compatibility implementation plan

> For agentic workers: use executing-plans; one integration writer.

**Goal:** Read validated9/10 data while original production writers refuse it.
**Architecture:** Reuse prepared exact snapshot schema; separate read call sites
from the original shared write guards. No new dependency or public API.
**Tech Stack:** TypeScript, Node SQLite, existing owned test fixtures.
**Spec:** ../specs/2026-11-08-production-readonly-schema-compatibility.md

## Constraints and review focus
Unknown/mutated schema, FK-off, request budget, real last-good document/Runtime
rows, and original writers on both new versions must be covered. No user DB.

## Integrated task
- [x] Extend existing document, contract-admission and workspace-capture suites
  with exact9/10 positive and write/schema/FK/budget-negative cases; run RED.
- [x] Update only constructor/read gates; preserve apply guards and validation.
- [x] Build Storage and run affected existing tests, architecture and formatting.
- [x] Independently review final diff, update status/trace and sync exact files.

## Verification

Run from repository root using fixed Node24.15.0:

- `node node_modules/typescript/bin/tsc -p packages/storage/tsconfig.json`
- `node --test --test-concurrency=1 packages/storage/test/document-store.test.mjs packages/storage/test/contract-schema-admission.test.mjs packages/storage/test/workspace-compilation-input.test.mjs packages/storage/test/compilation-input-store.test.mjs packages/storage/test/contract-store.test.mjs packages/storage/test/declared-schema-contract-store.test.mjs packages/storage/test/document-migrations.test.mjs`
- `node scripts/check-architecture.mjs`; changed-file Prettier check; `git diff --check`.

Initial targeted8 failed at old admission. Final combined118 passed, no skips.
Read-only independent review found no Critical/Important production issue; its
coverage note was addressed by restoring the test-owned original trigger and
proving exact CURRENT reads before the new-version writer refusal. Associated
Contract admission suite is rerun after that test-only correction. No test
creates permission, production migration or actual Native qualification.
