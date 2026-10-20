# Phase 0.5 Native parse/worker observation decision

Status: written ADR/spec, design §9 correction and revised existing Task5 plan
ACCEPTED by the successive user “继续” replies to their review requests.
Implementation is in progress; no numeric/profile/integration or exit approval.
Historical direction record: the user selected
“同意推荐方向，补充详细设计” on2026-10-15. See the written
[design](2026-10-15-p05-native-parse-observation-design.md) and accepted ADR-018.
This is the Task5 issue/proposal required when
existing instrumentation cannot prove actual worker completion variation. It is
not a new implementation authorization, resource profile, milestone or phase.

## Intent and evidence

Finish the already required changed-only parsing and Worker Consistency proof
without adding a scheduler knob, weakening ADR-017 or mislabelling protocol order.
The user authorized continuous execution of the existing closeout plan; this new
cross-process observation contract remains a material design decision.

Actual code evidence:

- `crates/native-analyzer/src/analyze.rs::parse_source_observed` invokes its parse
  callback immediately before Java analysis, after verified source reading.
- `crates/native-analyzer/src/analyze/refresh.rs::run` supplies a no-op parse
  callback; `run_observed` supplies a no-op completion callback. The existing
  `forced_opposite_worker_completion_orders_preserve_exact_output_and_counts`
  Rust test uses those callbacks inside the process and proves controlled order.
- Normal Native child processes do not export these observations. Sorted output
  identity/checksum and SOURCE_FILE delivery counts cannot identify parse-call
  counts or worker completion order. Two requested counts or two order labels
  cannot supply this missing physical observation.
- `scripts/evaluate-phase05.mjs` therefore retains the two required worker rows as
  NOT_RUN. The fixed31-case/21-incremental inventory and original gates remain.
- The new bounded consumed-record observer proves SOURCE_FILE deliveries and raw
  UPSERT/REMOVE identities only. It explicitly does not claim parser invocations
  or scheduler completion order. Three original shared deletion recipes have
  actual Rust0/0/1 operation evidence, not a solution to this worker gap.

## Alternatives

1. **Recommended direction: bounded Native diagnostic observation.** Reuse the
   real parse/complete call sites; expose a small, separately identified
   diagnostic stream on stderr, consumed through the existing process owner and
   a private Evaluation observer. Preserve stdout IPC versions/checksums, public
   indexing configuration, Canonical IR and SQLite authority. This preserves the
   requirement that worker rows exercise the real public index entry. It changes
   Native and consumer build identities and requires detailed compatibility,
   privacy, backpressure and measurement review before implementation.
2. **Test-only executable/component evidence.** Reuse the controlled Rust test
   callbacks with a qualified observer build. Keep public-index trials mandatory,
   but explicitly design how separate component observations can supplement them.
   They cannot silently become the actual public worker rows: ADR-017/evidence
   applicability and acceptance would need a reviewed amendment. An instrumented
   executable is not automatically the shipping executable or its memory proof.
3. Leave the missing observations unavailable. Safe, but Worker Consistency and
   Phase0.5 exit remain blocked; no phase promotion or all-work-complete claim.

## Constraints on the recommended detailed design

These are proposed constraints, not an implemented telemetry schema:

- Observe actual parse entry and actual settled parse completion; distinguish
  successful, partial and failed work. Keep input/delivery/order observations
  separate. Do not infer a parse from a final Source record or infer completion
  order from sorted protocol output.
- Bind observations to the original invocation and independently prepared Source
  inventory. Use bounded hashed references, never source text, raw paths,
  environment variables, prompts or secrets in the diagnostic record.
- Reuse existing caller stderr/event/resource limits and concurrent process-owner
  draining; no unbounded queue, second stream reader or raised transport cap.
  Truncated, absent, malformed, duplicated or foreign observations cannot pass.
  Observation failure must not invent a successful Native result or hide the
  original error/exit/receipt.
- Exercise the same independently pinned input and IDs with distinct feasible
  worker counts and genuinely observed order variation. Preserve the existing
  deterministic opposite-order Rust test. No production delay/order flag, new
  adaptive scheduler or retry-until-green measurement.
- Verify unchanged strict v1/v2/v3 stdout, ordinary stderr/error behavior,
  cancellation, slow sinks, bounded resources, normalized graph/support/coverage
  and stale-state outcomes. Required new Fixtures and precise diagnostic contract
  must be reviewed in the existing Task5/6 packet before coding this direction.

## Governance and execution boundary

The proposal does not supersede any FROZEN authority. Detailed review must check
ADR-010/014/016/017 and the Native IPC/security specifications. If an alternative
requires changing a FROZEN contract, submit an ADR/Design Change Proposal before
implementation; no silent exception is permitted. Numeric thresholds remain
unchanged and no reservation value is proposed here.

Continue all unaffected checks and retain their failures. Hold only this new
Native/consumer contract, final whole-product review and subsequent identity
freeze/calibration/holdouts until its direction and detailed packet are accepted.
Existing D5 R1/R2/full22 obligations are not removed or re-counted as new tasks.
After corrections, use the original Task6 -> Task7 -> Task8 order, including the
separate exact numeric approval and original Phase0.5 exits. Do not reinstall
old-build profiles or begin Phase1 implementation to bypass this decision.
