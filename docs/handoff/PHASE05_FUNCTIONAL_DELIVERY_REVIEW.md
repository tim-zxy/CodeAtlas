# Phase 0.5 functional delivery review — 2026-10-13

Status: code/evidence inventory; the user approved the recommended read-only packet scope/order and subsequently its [written design](../superpowers/specs/2026-10-13-p05-code-query-cli-design.md). The [implementation plan](../superpowers/plans/2026-10-13-p05-code-query-cli.md) now awaits review before coding. This is not Phase acceptance or blanket implementation authorization. Preserve every original gate and existing unfinished implementation; do not delete the replay/ownership work or imply its acceptance. Evidence below is from the prior inventory turn, not rerun in the design/planning turns.

## What exists versus what a user can use

Subsequent implementation checkpoint (2026-10-13): the accepted design and Native plan now implement the complete read-only query/Runtime/CLI routes described below. The table remains the original pre-implementation inventory, not current absence claims. New registered Fixture and179/179 feature evidence are in CURRENT_STATUS; required42 profiles/final verification remain open, so no unconditional acceptance or Phase completion follows. The latest “继续” authorizes continuing acceptance, not bypassing the unavailable automatic approval service or installing numeric profiles.

| Capability | Actual evidence | Remaining gap |
| --- | --- | --- |
| Java Native production and validated incremental application | `native-refresh-workspace.ts` drives process/decoder/Stage/normalization/seal/Application/Store. Fresh Runtime/Store suites pass103/103. | Tests include offline/private kernels and component fixtures; not all are guarded production-entry acceptance. |
| Atomic graph/support/Evidence/R010 activation and recovery | Existing Store and real Runtime fixtures check coactivation, reopen and rollback. | D4 index explicitly remains partial/unregistered; full failure matrix/required registration remain. |
| Guarded Native REFRESH entry | `native-refresh-composition.ts` calls trusted preparation before the prepared kernel. Fresh test verifies absent profile refuses before opener/database. | Exact-purpose reviewed profile is absent; entry is not exported from Runtime public index. Do not bypass it to expose a product command. |
| Source freshness foundation | Storage `readActiveAnalysisState` / `readAnalysisFreshness` read indexed state and compare persisted revision fingerprint. | Persisted-source equality is not a fresh disk scan. A query must distinguish observation scope/unknown source state rather than claim current worktree truth. |
| Code graph queries / bounded code trace | Active Canonical tables exist, but no corresponding query service/use-case or Runtime query API was found in Storage/Application/Runtime source inspection. | P05-W5-001 product functionality remains to implement. Private replay SQL comparators are not a public query implementation. |
| CLI index/understand/trace | `apps/cli/src/main.ts` supports only `--smoke`; actual `understand` and `trace` each exit2 with the P0 unimplemented message. | P05-W8-001 product commands and E2E flow are absent. |
| Evaluation tooling | Phase0 registry/comparator/metric CLI exists; Phase0.5 expectations and some task fixtures exist. | P05-W9-001 persisted full/incremental/accuracy/worker-consistency/stage baseline is not closed. |
| Recent replay helpers | Byte/path/hash/record checks and narrow oracles exist. Planned full materializer/reader/restore/verifier exports and Input Manifest are absent. Worker keeps null complete totals/calibrationEligible:false. | These are unfinished acceptance infrastructure, not additional user-visible features or full22 qualification. |

Keep the previous10/14 integrated roadmap count; this review did not query remote integration or re-grade all Phase exits. Passing local tests do not close a roadmap task or Phase.

## Fresh reproducible checks

Workspace HEAD645e17faad71d261e8c558be2f9e89ee5120c927 with162 inherited status entries; this review changes documentation only and preserves them. `.codegraph` is absent, so source inspection used rg/files directly.

- `node --test --test-concurrency=1 packages/runtime/test/native-refresh-composition.test.mjs packages/storage/test/native-refresh-patch-store.test.mjs`:103/103,0fail/skip/cancelled,37927.0615ms,exit0. Raw log: `.superpowers/sdd/2026-10-04-p05-w3-020-native-refresh-composition/functional-review-native-runtime-store.log`.
- `node apps/cli/dist/main.js understand` and `node apps/cli/dist/main.js trace`: each exit2; stdout has no product result, stderr reports CLI behavior not implemented. Raw logs in the same owned workspace: `functional-review-cli-understand.log` / `functional-review-cli-trace.log`. These probes and source routing together establish missing commands, not a regression fix.
- Static checks locate admission before opener at `native-refresh-preparation.ts`, the empty transport-profile hold and internal-only export boundary, unfinished replay main interfaces, and WORK_BREAKDOWN task dependencies. No new full root/build/Rust/hosted/calibration result is claimed. Prior42 root profile failures and intermittent timeout evidence remain open.

## Proposed next complete functional packet

Recommend P05-W5-001 plus the **read-only understand/code-trace portion** of P05-W8-001. Its declared predecessor is the active Canonical Store, not completed Native REFRESH admission. A user would be able to open an existing validated repository graph, identify a symbol, inspect its incoming/outgoing relations and obtain a bounded deterministic CALL trace with confidence, source references, coverage and explicitly scoped freshness warnings.

Use Storage read ports → Application queries → Runtime composition → CLI, respecting MODULE_BOUNDARIES. No app-to-SQLite shortcut, LLM, implicit reindex/update, new knowledge workflow, framework semantics or BusinessFlow/RuntimeFlow inference. Unknown/unresolved targets remain unknown. Missing graph/repository/schema errors must not become a successful empty response.

The packet's acceptance is one complete public workflow, not a helper count:

1. Validated existing graph → symbol lookup/search → relations → CLI understand output with evidence/confidence/coverage/freshness.
2. Explicit caller node/edge/depth budgets → deterministic bounded CALL traversal, cycles and truncation reported; no execution order invented from dependency edges.
3. Unknown/ambiguous targets, legacy/stale/not-indexed states and insufficient coverage remain explicit. Do not upgrade stored-source freshness to observed current-disk freshness without a read-only source observation.
4. Actual CLI process E2E, independent graph goldens, zero canonical writes/Native invocation/automatic indexing, failure/cancellation and architecture guardrails pass.

This requires a reviewed detailed spec and executable plan before coding; the written spec is accepted and the executable plan now awaits review. Native/inline remains the execution preference. No new numerical quality/performance threshold is proposed. Index/full/incremental/status CLI remains required later within Phase0.5, not DEFERRED to a future phase and not counted complete by this read-only packet.

Alternative is to continue the original D5 closure first: it unlocks production incremental indexing only after complete R1/full22 replay/measurement/final rows/CLI/calibration/holdouts/numeric approval. That is valid but offers no near-term query/CLI capability. The now accepted read-only packet offers visible functionality without weakening that admission hold; this report does not cancel the accepted D plan.

## Retained gates and delivery discipline

- Freeze/calibrate exact-build Native admission after the relevant non-profile product changes stabilize. `nativeMetadataEnvironment` hashes IR/Storage/Providers/Runtime built JS; later Storage/Runtime query additions change identity and make earlier profiles inapplicable. Do not transplant profiles or invent reservations. Four-purpose evidence, independent holdouts and separate numeric approval remain mandatory before guarded indexing release.
- Retain R1 source-lifetime/alias/failure completeness; immutable replay/dependency/root/oracle checks; actual pre-close TEMP/transaction proof; deterministic Canonical/source state and exact refusals; D6 registration and E/Phase Evaluation. Only consolidate their implementation into a complete acceptance package instead of reporting each primitive as delivery.
- Stop adding stand-alone helper prerequisites as the next visible milestone. Keep TDD and relevant step tests, then run the full declared gates at the complete feature-packet acceptance boundary. No test/gate/baseline is deleted or weakened.
- Original Phase0.5 Symbol Recall≥95%, Direct Call Precision≥95%, Recall≥90%, declared incremental correctness100% and stale binding facts0 remain unchanged. No phase promotion, migration/FROZEN/Deferred change, staging, commit or remote action follows this review.

Next decision: review the executable plan before implementation. Scope/order and written-design approvals are already recorded; Native/inline choice is preserved.
