# Owned Capability input implementation review

Scope: approved explicit current published Components from self-owned SQLite,
same immutable snapshot/version/bytes, private semantic TEST_DOUBLE only. Baseline
79da40105d480cce540ac636334dd9b6d3f54956. No frozen cloud candidate or evidence changed.

Actual fixture publishes a Component through existing Evaluation, Application
Preparer, opaque allocation and Store transaction, then reads exact generated
IDs/revision through the Store. An initial fixture error included an unused
REPOSITORY ref outside publication's captured registry; it was removed from the
fixture without changing the validator. After this correction, the positive
regression failed specifically because runOwnedCapabilityTestDouble did not exist.

The private Store projection adds the original attempt snapshot inputDigest in
the same permission-guarded transaction; original read response/manifest stay
unchanged. The semantic composer checks exact source IDs AND digest, references,
support-value closure, current head, coverage and complete context digest. Same
account and copied control remain through read/generation. Caller DTOs and test
permissions do not establish production authority; no recursive knowledge read.

Independent read-only final source/test review found one P2: KnowledgeControlStop
uses message categories, which were being misclassified. A regression reproduced
CAPABILITY_UNAVAILABLE instead of cancellation; the fix safely recognizes the
actual class and maps all four control categories. Two focused tests passed after
build, and narrow independent re-review confirmed the correction. No remaining
concrete P1/P2 reported; reviewer did not run workloads or edit files.

Final fresh Storage/Application/downstream Runtime TypeScript builds passed.
One concentrated six-file suite passed84/84,0fail/cancel/skip/TODO,11728.153ms:

```
node node_modules/typescript/bin/tsc -p packages/storage/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/application/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/runtime/tsconfig.json
node --test --test-reporter=tap --test-concurrency=1 packages/application/test/owned-capability-input.test.mjs packages/application/test/semantic-test-invocation.test.mjs packages/application/test/captured-business-input.test.mjs packages/storage/test/offline-published-knowledge.test.mjs packages/storage/test/offline-publication-store.test.mjs scripts/test-workspace-structure.mjs
node scripts/check-architecture.mjs
```

Architecture17 passed. Raw log:
.superpowers/sdd/2026-11-11-owned-capability-input/targeted-tests.log. The new10
tests are in the mandatory root suite. Scoped format/diff and source synchronization
are recorded with the resulting commit; no full Native/qualification rerun claimed.

Ruling: project-approved targeted checks and retained raw evidence take priority
over generic skill full-suite/deletion instructions. No evidence was deleted.
Ruling: snapshot ID equality is insufficient; project-owned source digest is part
of the approved same-snapshot binding, exposed only by an additive private reader.

This closes a private input slice, not P1-11 semantic quality, production reads,
publication, real-model evaluation or Phase1. Ordinary capture and production MCP
remain closed. Phase1 stays4/21; A6 NOT_QUALIFIED; E02 PROPOSED/uninstalled. Cloud
sampling stays bound to source79da401 and its retained seed; it does not qualify
the new development source or rebuilt local dist.
