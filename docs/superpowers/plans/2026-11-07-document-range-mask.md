# Offline document range masking implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement inline.

**Goal:** Provide bounded byte masking without granting scan clearance.
**Architecture:** Private Documents pure transform, existing DocumentAccount and
stdlib only; no production call site or public export.
**Tech Stack:** TypeScript, Node Buffer, Node test.
**Spec:** ../specs/2026-11-07-document-range-mask.md

## Global constraints

No user data, installed package updates, real identity queries, models, database
migration, publication, R9, permissions or scanner clearance. Existing gates stay.

## Review focus

Unicode scalar boundaries; original byte offsets versus UTF16 columns; getter/
proxy/shared input; overlapping ranges; cancellation/budget failures.

## Single integrated batch

- [x] Add literal cases to `packages/documents/test/secret-preflight.test.mjs`,
  importing private `document-range-mask.js`; run RED before implementation.
- [x] Add `packages/documents/src/document-range-mask.ts` implementing
  `maskDocumentRanges(source:Uint8Array,ranges:unknown,account:DocumentAccount):Buffer`.
  Validate and snapshot before mutation; preserve CR/LF and mask other selected
  bytes; invalidate on any error.
- [x] Build Documents, run detector/Document preflight and affected component
  suites plus architecture check. Require all executed tests pass.
- [x] Update status/traceability with exact evidence, review diff, exact-stage
  and normal-push one batch; reuse triggered CI, no duplicate run.

## Execution evidence

Original five RED tests failed because the private function was absent.
Independent read-only reviewer found one Important: empty/sparse ranges bypassed
byte-work accounting. `charges work for every byte` reproduced the failure before
the fix; full-source accounting now passes it. Final affected batch59/59, no skips,
Documents build exit0 and architecture17 pass. Exact test command:
`node --test --test-concurrency=1 packages/documents/test/secret-preflight.test.mjs packages/application/test/document-write-preflight.test.mjs packages/application/test/parsed-document-write-preflight.test.mjs packages/application/test/parsed-document-components.test.mjs`.
No additional contract ruling or deferred minor. Review was file-scoped; reviewer
could not obtain Git status, so integrator separately checks exact Git diff/staging.
