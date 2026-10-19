# Phase 0.5 Evaluation evidence-layer amendment

Status: ACCEPTED WRITTEN DESIGN, 2026-10-15.
The user's “批准，继续执行” accepts this design and
[ADR-017](../../handoff/adr/ADR-017-phase05-evaluation-evidence-layers.md) following
the explanation of separate written-design, revised-plan and numerical gates.
The subsequent user “确认” approves the revised existing closeout plan for Native
execution of these interfaces. No numerical reservation or remote action is approved.
Do not create another Handoff, restart Phase 0
or add roadmap tasks.

## 1. Intent and unchanged boundaries

Finish the original Phase 0.5 proof with truthful evidence: recorded Provider
contracts must not masquerade as live Native extraction, and a declared Source
metadata test must not masquerade as public Git classification. Component checks
and actual public indexing are both mandatory, but their observations differ.

Keep TypeScript control/Storage ownership, Rust/Tree-sitter, Canonical IR v1,
ProviderSnapshot v1, strict Native protocols, SQLite migrations, Source include/
exclude configuration and public index request/result/error contracts unchanged.
No direct Canonical SQL setup/repair or production injection seam is authorized.
Keep original 95/95/90/100/0 gates, critical scopes, no-default-full-reparse rule,
all22 D5 obligations, four exact admission purposes and separate numeric approval.
No new resource value, latency SLO, language/framework, non-Git product scanner,
Knowledge/Wiki/Agent feature or deferred capability is introduced.

## 2. Evidence and alternatives

Current implementation evidence:

- `packages/evaluation/src/phase05-report.ts`: v1 requires positive
  expectedEffectiveWorkers and true transaction/TEMP/child closure for all rows.
- The original recorded Fixtures contain four and three files respectively,
  including their literal input/expected JSON, but no executable source recipe.
  Original P05-W4-001/002 Evaluation sections specify component normalization/
  merge contracts, not another language extraction benchmark.
- `packages/source/src/classify.ts` derives TEST from test-path segments;
  `SourceScanRequest.config` exposes include/exclude only. Identical Caller.java
  bytes/path classify SOURCE, while the original producer recipe declares TEST.
- Reproduce with the existing workspace
  `.superpowers/sdd/2026-10-13-p05-index-evaluation-closeout/task5-scope-conflict-audit.mjs`.
  Its unsandboxed log passes; the first sandbox EPERM is not a functional failure.
- Recorded SQLite replay, process observation and owned recovery are implemented
  prerequisites. Last actual v1 report is still31 required/0successful/29failed/
  2not-run. Root42 exact-profile failures remain; those are not waived here.

Uniform Native obligations remain impossible for recorded inputs. Adding new
production Provider/Source configuration expands scope without helping the
original proof. Choose fixed evidence-layer applicability with a versioned report;
do not remove fixtures, invent observations or patch expected goldens.

## 3. Fixed case policy and inventory

One immutable pure Evaluation policy table is shared by the runner and v2
validator. It enumerates the existing31 semantic cases, legal scenario,
executionKind and expectedOutcome. It is not supplied by the CLI or inferred from
observations. Tests use an independently authored literal expected mapping.

| Cases per repetition                                                                                          | executionKind            | expectedOutcome  | Evidence basis                                                                      |
| ------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------- | ----------------------------------------------------------------------------------- |
| Cold/1-/5-/50-file:4; original Java Golden:5; successful non-metadata producer transitions:15; worker/order:2 | NATIVE_INDEX             | PUBLISHED        | Public runIndexCommand, actual Git/Source and admitted Native                       |
| Original syntax/unsupported PARTIAL transitions:2                                                             | NATIVE_INDEX             | PARTIAL_RETAINED | Public command refusal, validated Native PARTIAL and retained state                 |
| canonical-normalization; two-provider-same-call:2                                                             | RECORDED_PROVIDER_SQLITE | CONTRACT_MATCH   | Original recorded input + pure Golden + real Application/Store SQLite replay        |
| metadata-only-source-change:1                                                                                 | DECLARED_SOURCE_NATIVE   | PUBLISHED        | Declared Source metadata + qualified real Native/Application/Store component replay |

Totals are28 public-index cases and3 mandatory component cases, still31 per
repetition. Preserve original Fixture/scenario IDs, repetition coverage and source
pins; keep the metadata case in TRANSITION. The policy assigns rather than accepts
caller-chosen executionKind/expectedOutcome. Reject a foreign case, missing/extra
policy entry, mislabelled source case, duplicate key or partial repetition.

Materialize the policy before any operation and persist required-runs first.
Native requested/effective configuration uses the existing validated resolver;
worker/order cases retain their distinct declared counts and actual order proof.
Include complete policy + materialized run keys in corpusDigest, and policy code
in implementation identity. No independent generic applicability registry or mask.

## 4. Versioned report contract

Preserve `evaluatePhase05Report`, its v1 types, exact-key parsing and old reports.
Add an explicitly versioned pure `evaluatePhase05LayeredReport` and corresponding
v2 types in Evaluation. It imports no Runtime/Storage/Provider or test helpers.
The runner switches to v2 only when this amendment is implemented under the
reviewed plan. Reuse existing owned report IO with explicit version dispatch;
unknown versions fail. CLI retains its five paired flags and exit0/1/2 semantics.

V2 keeps the existing top-level identity, requiredRuns, observations,
aggregateCounts, gates, telemetry, missingRuns, failures and overall fields, with
`schemaVersion:2` and `kind:PHASE05_EVALUATION`. No v1 object is silently v2.

The pure input type `Phase05LayeredReportInputV2` has exactly schemaVersion,
identity, requiredRuns and observations, as in the v1 input shape. The result
`Phase05LayeredReportV2` adds exactly kind, aggregateCounts, gates, telemetry,
missingRuns, failures and overall. Do not accept caller-supplied gates, aggregate
counts, applicability policy or overall status as evaluator input.

V2 run keys retain fixtureId/scenario/repetition/requestedWorkers/
expectedEffectiveWorkers/completionOrderId and add the two closed enums above.
For the two recorded contracts only, both worker fields are null and completion
order is null. Native keys retain AUTO/positive requested workers and positive
expected workers. Mismatched policy/kinds/nullability is invalid input.

V2 observation retains existing fields, but acceptance `status` is
`PASSED|FAILED|NOT_RUN`, not operation SUCCEEDED. Add:

- `nativeOutcome: SUCCEEDED|PARTIAL|FAILED|null`: validated observed Native outcome;
  null for no observed/validated terminal, always null for recorded contracts.
- `workerUnavailableReason: null|NOT_APPLICABLE_RECORDED_PROVIDER|PUBLIC_REFUSAL_HAS_NO_WORKER_RESULT|NO_QUALIFIED_NATIVE_RESULT`.
  A positive effectiveWorkers requires null reason. A reason cannot exempt a
  successful Native workload or worker/order case from the worker check.
- `componentChecks: null|<fixed case-specific check record>` below. Null only for
  NATIVE_INDEX. Every required check is boolean|null; missing/extra keys refuse.

Keep strict safe integers, data-only snapshots, exact fields, sorted digest maps,
fixed sanitized failure diagnostics and unavailable-timing/peak reasons. V2
`failure` describes acceptance failure. A PASSED PARTIAL_RETAINED row has null
acceptance failure, nativeOutcome PARTIAL and its original failed command receipt
retained and hashed; it is never displayed as successful graph publication.

The pure evaluator validates structure, policy and logical gates; it does not
authenticate physical execution from a self-reported true flag or SHA alone.
The owned runner separately verifies actual artifacts/provenance and refuses
integrity drift. No serialized observation becomes an admission capability.

## 5. Mandatory component evidence

### Recorded normalization and merge

Reuse capturePhase05PinnedInputs, original pure contract and
runPhase05PinnedSqliteContract. Preserve recorded repository/revision/Source IDs,
semantic payloads, original pair order and reviewed snapshot-template binding.
Use Source Store and Application full/patch workflows; never direct Canonical,
Evidence, binding or candidate SQL seeding.

Fixed componentChecks for normalization:
`pairGolden,persistedGolden,supportCandidates,sourceActivation,coverage,reopenedImages,receipts`.
For merge:
`fullGolden,oneGolden,zeroGolden,reverseOrder,supportCandidates,evidenceHistory,sourceActivation,coverage,reopenedImages,rejectedPatchRecovery,receipts`.

All checks must be true, backed by the original pure/SQLite receipts and existing
full/one/zero image roles as applicable. Check all candidate payloads, the approved
selected representative,6/3/0 active supports, retained Evidence, exact Source/
activation, coverage and rollback. Preserve existing raw counts; none is a new
threshold or parser-accuracy sample. Require actual transaction/TEMP closure and
closed-copy/reopen verification for every phase, not just the last connection.
Require observed writer-connection closure before copying; successful copying or
absence of sidecars alone is not proof that the writer closed.

These rows require graphEqual/coverageEqual/supportEqual true and staleBindings0
from those SQL contract comparisons. facts and Native worker/outcome/child fields
are null; child null means fixed non-applicability here, not an observed true.
An unexpected Native child or fake positive worker field invalidates this layer.
Missing closure for applicable SQL resources still fails the entire report.

### Declared metadata transition

Keep original identical Caller.java assets, Source ID/path/content fingerprint,
declared SOURCE->TEST role and semantic relation expectations. Build independently
validated SourceFile/WORKTREE inputs; metadata participates in the target inventory
fingerprint before extraction. Apply Source changes through Source State Store.
Do not scan those declarations back through public Git and pretend they survived,
rename the fixture path, rewrite source bytes or add a role override to config.

Reuse the existing D5 component/replay primitives and actual Native producer plus
Application/Stage/Store full/refresh path. The existing test helper illustrates
declaration semantics but is not an executable qualification or approved budget;
do not import its hard-coded budget/offline setup as an admitted public command.
Use qualified owned inputs and caller bounds under existing D5 rules. If those
proofs are unavailable, this required component remains FAILED/NOT_RUN.

Fixed componentChecks:
`sourceMetadataTransition,originalRelations,fullRefreshAgreement,nativeStateCoactivation,activeSupportHistory,restart,rawOperations,receipts`.
All true is required, together with actual Native SUCCEEDED, matching observed
workers, graph/support/coverage equality, zero stale bindings and live SQL/TEMP/
child closure. Prove complete R010 coactivation and reopen/restart behavior.
Label the basis DECLARED_SOURCE_IR, not observed Git or public CLI functionality.
Original metadata incremental correctness remains mandatory; this is not an
exemption for the public add/modify/delete/restart/empty-delta paths.

## 6. Native success and expected PARTIAL

PUBLISHED NATIVE_INDEX rows retain every current public-entry requirement:
independent actual Git/Source binding, correct original Golden or transition,
qualified FULL/INCREMENTAL comparison, complete support/Evidence/coverage/R010,
actual workers and observed transaction/TEMP/child closure. componentChecks is
null. Public return, process startup or absence of a child cannot prove closure.
Raw shared-container UPSERT/REMOVE counts and worker completion order remain
separate original obligations; final-state equality cannot replace them.

For the two PARTIAL_RETAINED cases, do not require successful target FULL or
publish partial facts. Require, before any Evaluation restoration:

1. A qualified actual baseline; original pinned target Source transition bound
   independently, with expected current Source recorded separately from indexing.
2. Validated complete Native PARTIAL from this actual invocation, including
   correct request/context/checksum/counts and successful child/pipe settlement.
   ANALYSIS_FAILED, admission refusal, timeout, malformed stream, late nonzero
   exit or a raw-wire hash alone is not sufficient PARTIAL evidence.
3. Original failed public-operation receipt, forbidden publication calls not
   reached, and exact retained graph/activation/snapshots/Evidence/bindings/
   candidates/coverage plus historical R010 header/summaries across reopen.
4. Current Source may advance, but retained graph is not CURRENT on ID equality.
   A bounded Storage-owned retained-publication inspection distinguishes it from
   a reusable current Native baseline. Preserve READ_SEAL admission before SQL
   TEXT, complete owner/budget checks and old expected context; do not weaken the
   current-state reader or claim a stale R010 bundle is reusable for the target.
5. No new indexed activation/snapshot. Normalization/Seal/Apply are not reached;
   unchanged bytes alone cannot prove those no-call obligations. Parsed-file
   counts follow the original recipe and actual observations, not an assumption
   of zero parses. Actual transaction/TEMP/child closure and original diagnostic/
   unsupported-site expectations remain required.

These cases have nativeOutcome PARTIAL and may lack a public successful-result
worker count, with the exact PUBLIC_REFUSAL_HAS_NO_WORKER_RESULT reason. They do
not provide worker-consistency or performance samples. A lack of Native/profile
evidence still fails; this rule cannot convert current pre-admission refusals to
PASSED. If the outcome or retained state cannot be proven, keep the case failed.

## 7. Gates, aggregation and telemetry

- Accuracy remains only the independently registered original Java critical
  symbol/direct-call scopes, with raw TP/FP/FN and unchanged95/95/90 gates. No
  recorded/component, benchmark, expected refusal or synthetic count dilutes it.
  If any original Java scope is missing, failed or lacks validated successful
  extraction/metrics, critical gates remain NOT_EVALUABLE; observed raw counts
  are retained, never treated as a reduced complete denominator.
- IncrementalCorrectness retains the same21 declared cases per repetition:
  three incremental performance scenarios plus all18 original TRANSITION cases,
  including metadata and both PARTIAL cases. A case counts only when its complete
  expected behavior and applicable evidence pass. Nothing is removed from the
  denominator and expected refusal is not successful extraction.
- StaleProviderBindings remains0, checked for all applicable publication/retained
  images and every recorded support phase. Intentional Source freshness drift is
  not a broken Provider binding; report both without conflating them. Unknown
  binding evidence keeps the gate unavailable/failed.
- The two actual worker/order cases remain NATIVE_INDEX with distinct actual
  counts and genuinely observed order variation on identical source/IDs, equal
  Canonical semantics/coverage and no stale state. Component evidence cannot
  satisfy this obligation; distinct labels alone are not order observations.
- Overall PASS requires every one of31 cases per repetition PASSED, all original
  gates PASS, no missing run/integrity failure and complete fixed-layer checks.
  A component failure blocks overall PASS even if all Native cases succeed.
  A report PASS alone still cannot promote Phase0.5 without all original exits,
  complete registered root and D5/qualification/real CLI acceptance.

V2 telemetry groups by executionKind and scenario, retaining sample counts,
median/observed maximum and explicit measurement scopes. Component replay time
never becomes Cold/Incremental Native throughput or a successful parser sample.
Partial/refusal durations remain labelled failure-path telemetry, not successful
index performance. Unavailable scan/parse/resolve/peak stays null+reason. Existing
Node maxRSS scope excludes Native child; never fabricate total-system memory.

## 8. Compatibility, security, rollout and rollback

V1 reader/evaluator behavior and type/schema contracts remain unchanged. Historical
v1 reports and all eight original Fixture packs/pins remain byte-unchanged.
Add independently authored v2 policy/report vectors in
`packages/evaluation/test/fixtures/phase05-layered-report-vectors.json` after plan
approval; this is a proposed new file, not existing evidence. Do not change Fixture Manifest v1. The
new runner inventory/identity/receipts must come from a fresh run. Do not retag the
current0/29/2 report or old scoped receipts as freshly qualified v2 evidence.

No new CLI/config flag, public indexing API, Source option, SQL migration, Native
wire field, dynamic exemption or later-phase capability. Preserve shell-free
allowlisted process launch, bounded IO/SQL/metadata, receipt integrity, owned
original-location restore and failure evidence. All publication still uses
validated Application/Store. Any discovered FROZEN conflict stops the affected
implementation for a new governed change, not a permissive parser branch.

The existing Tasks4/5 implement the approved report/policy/component changes;
Task6 registers old and new tests and performs the single whole-product review.
Task7 still completes D5 R1/R2/full22, freezes the final corrected build, measures
all four purposes with independent holdouts and requests exact numeric approval.
Task8 reruns original real CLI/root/Fixture/Native/Rust and all phase exits.
No milestone/count changes; no new parallel plan or completed-query re-review.

Rollback selects the unchanged v1 evaluator/runner contract and keeps its FAIL
holds. Retain all versioned reports/receipts; never mutate a database or historical
profile to make rollback appear successful. Product-path changes invalidate old
identity-dependent evidence and must precede final freeze; no old-value reuse.

## 9. Verification obligations and review handoff

After written approval, revise the same eight-task plan with explicit interfaces,
RED->GREEN steps and evidence paths. Required negative controls include:

- All31 policy entries and21 incremental entries per repetition remain required;
  missing/duplicate/foreign/relabelled cases or truncated repetitions refuse/fail.
- A real-index row disguised as recorded, fake workers/closure on recorded rows,
  null workers on successful Native rows, and absent required component checks fail.
- A component Golden, candidate/history/coverage, reopen or rollback mismatch
  blocks overall PASS while leaving unrelated accuracy numerators unchanged.
- Worker/order, Native admission and original numeric gates remain mandatory.
  Missing/incorrect version, identity, digest or receipt cannot be reclassified N/A.
- Identical metadata source stays classified SOURCE under the actual public scan;
  only the separately labelled declared-Source component uses TEST. Verify no
  Source config/public request change and no direct Canonical SQL writing.
- PARTIAL must be actual validated completion; generic errors, checksum/exit
  failures, publication calls, drifted retained state or restoration before the
  comparison cannot pass. Nonzero stale state and unknown closure still fail.
- V1 golden report tests remain unchanged; v2 has independent literal success,
  component-failure, Native-failure, expected-PARTIAL and version/refusal vectors.
  Pure vectors prove logic only; actual-mode evidence requires qualified execution.

This written spec and ADR-017 are accepted. That approval permits revising the existing
implementation plan, not immediately implementing a new interface. Preserve
Native/inline execution choice and continuous approved order after plan review.
The subsequent whole-plan “确认” has now passed that gate; ordinary execution
continues without another per-helper review or confirmation.
No coding, test/Fixture mutation, gate passage, commit or remote action occurs in
this documentation-only handoff.
