# Private document historical read plan

> **For agentic workers:** Use superpowers:executing-plans; existing authorized roadmap work, single integrator.

**Goal:** Let private consumers read an exact immutable DocumentRevision rather than silently replacing it with current head.
**Authority:** Existing immutable DocumentRevision and pinned CompilationInputSnapshot inputs; W007 ownership/FKs. No new snapshot identity, permission or publication contract.
**Success:** readRevision(documentId,revisionId,limits,syncCheck) returns that stored complete revision or null for an absent scoped revision. It never falls back to current. readCurrent retains behavior with an optional synchronous control callback. Both share original SQLite snapshot, exact schema7/8/FK/budget/normalized-integrity checks. Control is checked between bounded SQL/parse/item stages and before snapshot release; it does not interrupt SQLite VM or authenticate Source. Missing/async/thenable controls cannot authorize the new historical path; genuine rejected Promises are settled as in existing Store.

- [x] Add historical-after-head-change, absent/wrong document, immutable result, cancellation/async-control, corruption and SQL snapshot cleanup checks; run missing API RED.
- [x] Factor only the existing read implementation into one private path and add exact historical selection plus control checks. Preserve current corruption semantics and all limits. No DDL/IR/root export changes.
- [x] Run complete DocumentStore/current/historical/migration/contract compatibility cohort and builds/architecture. Record evidence and batch synchronize with parser/coverage audit materials.

Parser adoption/scan clearance, actual capture/source authorization, shared-run resources and formal parent acceptance remain separate and open. No real Native/R9/model/remote source or user DB.
