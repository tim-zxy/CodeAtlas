# D5 cancellation replay identity — evidence and change proposal

Status: WRITTEN CONTRACT ACCEPTED by the user's 2026-10-16 instruction to finish
related work without further routine questions. The existing
[composition specification](2026-10-04-p05-w3-020-native-refresh-composition-design.md#r2-cancellation-identity-amendment--written-review-draft-2026-10-16)
and same-plan Task7 supplement control implementation. Reviewed113/113,
architecture17 and current v2 full44/44 pass; the single review's two Important
findings are corrected. Four-purpose320/64 calibration/holdouts and fresh host
reproduction pass; exact numerical approval/static entries/actual gates remain open. Earlier
direction/review-pending dispositions below are historical; retain the original
counterexample. No unknown numeric approval, profile or phase promotion follows.

## Decision requiring review

The accepted composition R2 contract requires exactly equal outputBytes and
eventCount for every original22 class, including d-cancel. Fresh evidence shows
that this assumption is false for the existing real cancellation workflow.
Changing its identity/evidence contract requires an explicit governed decision,
not another successful retry, a tolerance or rewriting the observation.

Authority: ADR-016, DESIGN_AUTHORITY, IMPLEMENTATION_PROTOCOL and the accepted
2026-10-04 composition spec's R1/R2 contract. This is a proposed correction to
an EVOLVABLE private measurement/Fixture assumption, not an amendment to the
FROZEN IR/IPC/storage/security/lifecycle architecture. If detailed design finds
a FROZEN conflict, an accepted ADR is required before that work proceeds.

## Verified evidence

Current product digest:
0ea17dfcc71d7c2d3ffb1bc782ab47c63f6c2294041dc50e0a14e1362242711d.
Native executable SHA256 remains
9c59e427eaa82c561c24a5938b0508252d17e01f7f80fa580782fa764f19fd2f.

Earlier current-code run task7-measured-full22-reviewed.log passes44/44,
2521287.0056ms, including all22 measured cases. That finite sample does not
override a later contrary original-process observation.

Later task7-worker-private-complement.log settles454 tests/412pass/42fail/
0skip/0cancelled,1225354.0157ms/exit1. The42 failures are one shared materializer
failure propagated to its dependent cases, NOT42 distinct implementation bugs
and NOT the older registered-root42 missing-profile failures.

Both trials below use one original generated binding, seed and invocation:
C:/Users/Freya/AppData/Local/Temp/codeatlas-corpus-materializer-NUjjor/new/artifacts/cases/d-cancel/.

| Original receipt | PID | inputBytes | largestLineBytes | summaryBytes | outputBytes | eventCount |
| --- | --- | --- | --- | --- | --- | --- |
| trial-0.json |23288|13185|3602|9515|1139|3|
| trial-1.json |456|13185|3602|9515|753|2|

Receipt SHA256:
- trial-0.json: f6612ff9b31ba4ccad9ffb0990efc617fa13dc135e3e708d1e10c088f310fdf7
- trial-1.json: 7df2a028670266cee2c3f7b2a773526be69822ad273bdd130eb43877bcc90f82

Both have the exact original NativeClientError cancellation, CANCELLED outcome,
operationThrew=true, zero main Apply calls, transactionClosed=true and
tempClosed=true. Existing independent16-table Source/activation verification
matches each retained result against the original closed seed. The owned
task7-cancel-identity-audit.log independently verifies these facts and hashes;
its exit0 establishes the discrepancy, NOT eligibility.

Reproduce using the existing original command:

    node --disable-warning=ExperimentalWarning --test --test-concurrency=1 --test-name-pattern='D5 replay materializer freezes' packages/runtime/test/native-refresh-transport-replay.test.mjs

This uses real processes and preserves all attempts. Cancellation scheduling is
not promised to reproduce the differing counts on every run; the two retained
original receipts are already a counterexample. Do not retry until green.

## Cause boundary

The existing wire observer counts actual consumed stdout chunks before yielding
them to the decoder (native-refresh-wire-probe.mjs). d-cancel aborts at the
existing first blocked Stage sink (native-refresh-transport-worker.mjs).
Receiving a different amount of already-produced stdout before cancellation is
consistent with the two observations. This does not prove that every timing-
dependent field or other class is variable. Preserve the real cancellation,
failure/closure/state checks and all other classes' existing equality checks.

## Alternatives and recommendation

1. Recommended direction: keep the fixed request/seed/source/control identity,
   but treat d-cancel's actually received output as a verified cancelled prefix,
   not a preselected exact total. Freeze an independent complete real-Native
   reference stream before measurement; retain the original measured stream's
   byte count/event count/hash as actual observations. After child settlement,
   independently hash the corresponding reference prefix and count its LF
   records. Require exact prefix/hash/count agreement, the original cancellation
   gate, zero Apply and exact preserved state. No discarded samples or invented
   tolerance; use only existing producer/client limits. Keep all actual peaks,
   including cancellation/refusal peaks, in the unchanged reservation policy.
2. Keep exact totals by replacing calibration d-cancel with a deterministic
   controlled fault child. This changes which real execution the class measures
   and can omit buffered real-Rust cancellation behavior. It is not approved and
   is not recommended as a silent shortcut; real cancellation still needs proof.
3. Retain the current equality contract and remain blocked. This is safe, but
   repeated sampling cannot establish the violated determinism assumption.

## Detailed-design boundaries before any implementation

If the recommendation is accepted, extend the EXISTING composition spec/plan;
do not create a second Handoff or roadmap task. Resolve and review:

- the exact private Manifest/case-digest representation of fixed input versus
  observed cancellation output; version compatibility must be explicit;
- strict reference-stream asset ownership/hash/physical binding and its separate
  pre-measurement validated Native provenance, never post-result expectations;
- scalar measured-output hash and original cancellation-gate provenance through
  the existing immutable sidecar/issued-parent owner; no raw stream cache or
  additional stdout consumer in the measured process;
- independent post-exit prefix/hash/LF comparison, original error/Stage gate,
  zero Apply, actual pre-close closure and full state verification;
- strict final-row/candidate/holdout checks that allow only this declared mode,
  reject changed prefixes/missing proof/forged counters, and keep the other21
  classes' equality checks and all existing numerical gates intact;
- all affected tooling/Fixture/traceability/acceptance documents and backwards
  compatibility tests, plus the original failed attempt as a permanent negative.

No Node/Rust worker count, memory/timeout/resource value, public config/API,
IPC/Canonical schema, production SQL/admission or database migration changes.
No new language/framework/Wiki/Knowledge/Agent capability or Phase0 reopening.
Rollback keeps the current fail-closed gate and last good graph. Existing report
formats and approved historical profiles must not silently reinterpret fields.

## Execution incident, separate from the product assumption

The intended complementary command used a negative --test-name-pattern that did
not exclude target cases on this installed Node runner. All44 selected cases
were accidentally executed again; the newly started materializer failed its
first class within3420.4681ms. No completed long corpus was regenerated there.
This was an executor mistake, not a reason to suppress the new failure.

An owned two-control probe confirms both attempted negative-name expressions
select both tests; the explicit positive --test-skip-pattern selects only the
intended ordinary control. Logs: task7-filter-original-probe.log,
task7-filter-corrected-probe.log and task7-filter-skip-probe.log. Future split
runs must preflight selection before costly execution. No full rerun is needed
to hide or overwrite this incident.

Passing-name union audit: the earlier44 plus later412 passes covers all454
names in the two private files, with no missing name. That is coverage evidence
only; it does NOT turn the newly demonstrated instability or current batch GREEN.

## Current disposition

Implementation of worker/final-row/CLI is present; its single independent review
passed and the eight neighboring suites passed412/412. Qualification/freeze,
calibration, holdouts, exact numeric approval, actual integration and Phase exits
remain blocked by the accepted R2 identity requirement. No profile installed,
no test/gate weakened, no PR/commit/merge and no phase advancement. Direction and
then the concrete written contract must be reviewed before implementation.
