# P1-04 Syntax measurement and admission proposal

Status: ACCEPTED 2026-10-22 by explicit user reply approving the recommended purpose/record/accounting/catalog preparation design and continued preparation implementation. This supersedes the earlier proposal-only state. Calibration, actual Native measurement, numeric profiles, new dependencies and cloud CI remain separately unauthorized.

## Recommended bounded scope

Use one new purpose, SYNTAX_OBSERVATION, with separately evidenced HOST and NATIVE components. Keep all old READ_SEAL/FULL_TRANSPORT/REFRESH_VERIFY/REFRESH_TRANSPORT layouts, catalogs, entries, selection and required cases unchanged. No generic profile framework or new package is needed for this proposal. Missing exact-current Syntax evidence must refuse in Runtime before lazy Source preparation or process spawn. No caller-supplied maxMemoryBytes, context digest or test flag substitutes for admission.

HOST covers the built strict request/capture validation, child transport buffering, complete stream validation and Python normalization/owner binding retained at this boundary. NATIVE covers verified Source reading, Tree-sitter grammar/parser, Java exact owner matching and serialized per-file result/output lifetime. Do not call this whole mixed Code+Syntax transaction measurement: provisional full Java analysis, Store activation and retained database cost remain separately governed P1-05 work. The eventual Runtime accounting must include any simultaneously live reservations; a Syntax profile alone cannot admit the whole mixed workflow.

## Exact-purpose record layout

A new strict record, not an additional accepted variant in old loaders:

- schemaVersion and purpose identity; candidate status (PROVISIONAL_REVIEW_REQUIRED or separately approved identity).
- environment: existing Node/V8/platform/arch/zod/built implementation digest, plus exact Native executable SHA256, Rust target/toolchain and Cargo.lock digest. Java0.23.5, Python0.25.0, Tree-sitter0.27.0, extractor and compatibility versions are explicit identity inputs.
- corpus: revision, input/catalog and independent expected-oracle SHA256; request/Source/resource shape digests and case IDs. Freeze actual inputs before collecting; test-only synthetic values are not production defaults.
- each raw observation: case/repetition, component, process identity/lifetime, peak method/units, positive peak bytes, exit/terminal/checksum/count/expected comparison, command and collection conditions. Missing peak/lifetime or incomplete/incorrect output makes the observation invalid.
- evidence: raw report paths/SHA256 and derivation identity, candidate calibration origin, independent verification references and review record. Verification cannot select or tune its own candidate.
- per component: observedPeakBytes, fluctuationAllowanceBytes, reservationBytes and method/units. Derived total reservation is the safe sum of the two component reservations, checked for integer overflow; it is a conservative accounting bound, not a measured simultaneous RSS claim.

Reuse the existing reviewed high-water/range rule independently for each component: maximum group high plus maximum within-group high-minus-low, with an applicable prior approval floor only for this exact purpose/component. There is currently no such approved Syntax floor. Do not transplant any Phase0.5 value. The total is the separately accepted accounting extension, not an installed numeric threshold.

## Measurement validity

HOST reuses resourceUsage.maxRSS with explicit units/Node platform semantics. For Windows Native, use a platform process peak working-set counter rather than equating a sampled current working set to a lifetime peak. Microsoft documents the process peak working-set field in [PROCESS_MEMORY_COUNTERS](https://learn.microsoft.com/en-us/windows/win32/api/psapi/ns-psapi-process_memory_counters). This establishes the metric, not correctness of a collector or access after process termination. Collector lifecycle/short-lived-child/missing-data conformance must be proven before any Native measurement can qualify; fail closed rather than fabricate a peak or silently change method. Reuse installed platform capabilities; any required new direct dependency needs separate approval.

The harness/measurement worker remains outside product admission. It may not expose an unqualified production bypass. Do not extend DESCRIBE maturity or Source classification merely because a diagnostic worker can run.

## Proposed case catalog and holdout

Prepare separate literal expected observations for: Python module/function/import static syntax; Java exact annotation/declaration ownership; mixed provisional Java/Python ownership; dynamic and malformed honest PARTIAL syntax; nested/large syntax within explicit caller limits; bounded large output; changed-only/remove/new-process restart; and initial absent activation. Cases must include non-framework controls. Catalog preparation pins exact Source bytes, counts, limits and independent oracles; no corpus size or runtime reservation is guessed here.

Use the existing five-repetition calibration convention, sequentially. Independent verification uses a separately frozen Source spelling/layout/owner-map holdout with its own literal expected facts. Do not use the calibration generator/product normalizer as the expected oracle. Source change/link, deadline/cancel, request/output limits and corrupt/truncated/post-terminal streams are failure/recovery checks, not successful memory samples. Fresh last-good/CAS/atomic-Apply correctness stays in the joint P1-04/05 acceptance.

## Execution sequence and approval boundary

1. Approve or amend this purpose/record/accounting/catalog direction; this permits implementing strict loaders, collector conformance, Runtime pre-spawn refusal and offline corpus preparation only.
2. Prepare the full exact candidate and harness; keep actual observer capability unadvertised. Review collector conformance, complete call path and fresh local tests.
3. Present frozen executable/built/source/corpus hashes, owned output root, exact commands/cases/repetitions, expected local run count, resource/time scope and alternatives for separate explicit measurement approval. No actual Native calibration/qualification run is authorized now.
4. If separately authorized, run once sequentially and preserve all failures. Present the measured candidate values and independent verification plan; obtain explicit approval before installing any numeric profile. No automatic retry/tuning to green.
5. Only exact-current admitted actual observations plus joint complete Code/Syntax candidate/Store evidence can close P1-04/05. If implementation changes, invalidate the affected qualification; do not automatically remeasure.

No cloud operation or CI is part of this proposal. Approval of this design does not approve measurement, values, dependency additions or product acceptance.


## Preparation contract refinements

The implemented v1 strict record pins policyRevision p1-syntax-observation-high-water-range-v1. Calibration origin is SHA256 of UTF-8 JSON.stringify(reports); derivation is SHA256 of JSON.stringify({policyRevision,environment,corpus,observations,components,reservationBytes,calibrationOriginDigest}) in that member order, preserving nested member order as loaded. Both are recomputed, not accepted as unrelated hex tokens. Raw referenced files are bounded/confined and hash-verified; this does not authenticate arbitrary caller files as approved production profiles. Runtime only uses its internal reviewed catalog, currently empty. There is no approved Syntax prior floor; priorApprovalFloorBytes is explicitly null in this version. A future actual approved floor needs its own reviewed update, never an old-purpose value.

Collector preparation validates supplied process/lifetime/OS-peak transcripts, including fast-child final-counter refusal. Windows acquisition is additionally checked with retained handles for two owned Node-helper lifecycles; it is not Native workload evidence. Eight unexecuted Source-shape/probe cases and separate holdout are frozen for preparation only; exact executable requests/limits, full actual-output oracles and OS acquisition evidence remain required before proposing any Native measurement run.


Raw calibration files use strict schemaVersion1/SYNTAX_OBSERVATION_CALIBRATION plus environment,corpus,observations, which must exactly agree with the profile. Raw verification uses schemaVersion1/SYNTAX_OBSERVATION_VERIFICATION plus calibrationOriginDigest,environment,corpus,observations. Each distinct required holdout record includes expectedMatched/terminal and source/oracle/output/peak-transcript digests plus both HOST/NATIVE peak method,units,process,lifetime and bytes. Each component must fit its already frozen reservation; verification cannot tune it. See the preparation review for actual checks and the explicit empty-catalog/no-measurement boundary.
