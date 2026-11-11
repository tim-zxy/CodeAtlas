# Owned Capability Input Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; one local integrator, existing frozen cloud candidate unchanged.

**Goal:** Explicit same-snapshot published Components reach the existing TEST_DOUBLE Capability boundary through the actual owned Store.

**Architecture:** Reuse exact published selection validation and the captured semantic composer. Add a private synchronous read composition, not a production producer or capture-schema extension.

**Tech Stack:** Existing TypeScript, Node SQLite, IR/Knowledge validators; no new dependency.

**Spec:** 2026-11-07-semantic-test-invocation.md, approved same-snapshot Component refinement.

## Constraints and success

Preserve snapshot bytes/digest, public schemas, opaque IDs and old refusal paths. Explicit unique current Component versions only; identical source snapshot/revision set, full captured references/supports, context digest including complete publication records. Never convert metadata to Source authority. Keep TEST_DOUBLE/NOT_EVALUABLE/NOT_ESTABLISHED and no publication. User databases, production access and frozen qualification artifacts stay untouched.

## One integration batch

- [x] Write a real owned SQLite Component publication/selection regression; observe missing private entry RED.
- [x] Add private read composition and bounded same-snapshot binding to semantic-test-invocation.ts; preserve coverage and original account/control.
- [x] Test mismatched identity/snapshot/support, stale head, permission/UNKNOWN, byte/work budgets, cancellation and generation/output refusal.
- [x] Build Application, run affected semantic/published-query/workspace tests and architecture guard; independently review final diff.
- [x] Synchronize controlling refusal specification, CURRENT_STATUS and traceability with reproducible evidence; prepare only this batch for normal authorized push. The actual commit/push/CI result is recorded separately.

Review focus: caller mutation during read, fabricated/unselected knowledge IDs, support metadata without captured values, nested coverage loss, asynchronous read cleanup uncertainty. Disable the private branch to roll back; no persisted data or installed entry changes.
