# Owned snapshot persistence implementation plan

> For agentic workers: use executing-plans in this session; one integration writer.

**Goal:** Create, persist, inspect and reopen a validated compilation snapshot in
self-owned temporary SQLite only, retaining immutable history and honest effects.

**Architecture:** Keep the production manifest at W008. Reuse the exact approved
candidate W009/W010 SQL as unregistered files. Share the existing pure snapshot
validator privately in IR; preserve Application imports through re-export. A
private Storage module owns synchronous transactions and attempt settlement.
No permission issuer, production wiring, W011 or publication is introduced.

**Tech stack:** Existing TypeScript/Node24 SQLite, existing bounded SQL/history
accounting, no dependency. **Spec:** policy-lifecycle-decision-proposal and
w009-w011-ddl-review-candidate; user approved the bounded temporary-database slice.

## Constraints and review focus

- Eight run states, immutable snapshots/supports and one-shot run binding.
- Exact workspace/RevisionSet/request/subject tuples, no digest-only identity.
- COMMITTED is independent of cleanup; uncertain commit/cleanup never retries.
- Reopened owner cannot prove old uncommitted absence; only complete rows or UNKNOWN.
- Private exact9/10 schema recognition; preserve8 behavior and failed-prefix old documents.
- Automatic review rejected widening production DocumentStore/ContractStore9/10
  admission as outside the temporary-store scope. That patch did not execute and
  is not retried; production readers keep their existing refusal. Full production
  reader compatibility remains a separate explicit decision, not a completed gate.
- Existing production backup refusal/manifest/checksums remain unchanged.

## One integrated batch

- [x] Add failing Store tests: capture/put/reopen/read, immutable membership,
  cross-workspace/request conflicts, rollback, lost COMMIT receipt and old readers.
- [x] Move the unchanged compilation-input-contract implementation to a private
  IR module; keep Application compatibility re-export and validate both builds.
- [x] Extract candidate SQL to storage/migrations/workspace-proposed/009 and010;
  keep them outside manifest. Add a private reference-schema loader and bounded
  exact metadata comparison for explicit9/10 compatibility after preparation.
- [x] Implement private knowledge/compilation-input-store: createRun, putSnapshot,
  readSnapshot, inspectCommit; synchronous authorization/control callbacks remain
  required and grant nothing by themselves. No model/publication/source-event writer.
- [x] Connect existing capture to the Store in self-owned disk tests, including
  real close/reopen, failed prefixes and nonempty last-good document data.
- [x] Build affected packages, run new and affected snapshot/schema/storage tests,
  architecture and formatting. Obtain independent review; fix only relevant findings.
- [ ] Update status/trace and the bounded candidate record, exact-stage, commit,
  push continuation and track that automatic CI without retriggering.
