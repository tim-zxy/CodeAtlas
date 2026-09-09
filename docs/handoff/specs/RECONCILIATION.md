# Knowledge Identity and Reconciliation Specification

## Identity

Knowledge IDs are opaque and stable. Identity uses type-specific structural signals: entry-point overlap, runtime-flow topology, contracts, support identities, mapped implementation, scope, state, and only secondarily semantic similarity or usage. Names and prose are not identity keys.

An identity result contains matched ID, score, per-signal explanations, threshold, ambiguity margin, and candidate alternatives. Usage may support stability but never override structural truth.

## Outcomes

```ts
type ReconcileOutcome =
  | "UNCHANGED" | "UPDATE" | "NEW" | "MERGE" | "SPLIT"
  | "CONFLICT" | "DEPRECATE" | "REVIEW_REQUIRED";
```

- `UNCHANGED`: semantic fingerprint is unchanged; presentation may rerender.
- `UPDATE`: same identity with a non-structural semantic evolution.
- `NEW`: no candidate clears the new-identity threshold.
- `MERGE`: choose a survivor by human pin, curated status, stable age, support, usage, and external references; archive others with `SUPERSEDED_BY`.
- `SPLIT`: create derived identities and require review in Phase 1.
- `CONFLICT`: same identity/scope/overlapping time/state intent with mutually exclusive values.
- `DEPRECATE`: sustained lack of support under a conservative policy.
- `REVIEW_REQUIRED`: ambiguous or high-risk structural change.

## Evidence and support health

Evidence states are `ACTIVE | STALE | INVALID | SUPERSEDED`. Knowledge health aggregates active/stale/invalid and observed/declared/authoritative support plus grounding. One stale support does not automatically stale the item. Worktree-only disappearance uses a more conservative deprecation policy than committed/snapshot evidence.

## State-aware reconciliation

`CURRENT REST`, `TARGET Kafka`, and an in-progress Migration form a transition, not a conflict. Architecture drift is reported when observed current state violates a target/rule whose migration state says it should already apply.

Curated corrections become `CURATED_LABEL`, `CURATED_RELATION`, `CURATED_FACT`, or `CURATED_RULE`; resolver aliases become ResolutionRules. Curated facts retain scope/time/state and are revalidated rather than becoming eternal locks.

## Defaults

Phase 1 enables auto-update, cautious merge, no automatic split, delayed deprecation, and review for core/critical structural changes. Identity and reconciliation changes require fixtures for rename, reword, update, ambiguity, merge, split, disappearance, transition, and drift.

