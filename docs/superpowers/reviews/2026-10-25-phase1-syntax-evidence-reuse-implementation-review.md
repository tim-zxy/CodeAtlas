# Phase1 R-01 historical Syntax evidence reuse implementation review

Date: 2026-10-25. AUTHOR_SELF_REVIEW under the user's sequential/no-agent constraint; no independent reviewer. [Approved R-01 plan](../plans/2026-10-25-phase1-syntax-evidence-reuse.md), [reviewed inventory](../specs/2026-10-25-phase1-syntax-evidence-reuse-inventory.json), [M-02 protocol](../specs/2026-10-25-phase1-syntax-confidence-evidence-protocol.md).

## Result and limits

R1–R3 complete only as LOCAL_HISTORICAL_SYNTAX_EVIDENCE_REUSE_ONLY. [Independent Source annotations](../specs/2026-10-25-phase1-syntax-evidence-source-annotations.json) cover all 18 retained cases and 19 original Source files; 18 nonempty Sources have exact full-file byte anchors. The new [offline checker](../../../scripts/test-syntax-evidence-reuse.mjs) compares retained expected templates with actual historical bytes and existing pure/bounded consumers, checks Source ranges, reports explicit gaps and never publishes Canonical Syntax.

The report is `.superpowers/sdd/2026-10-25-phase1-syntax-evidence-reuse/reuse-report.json`. It retains 18 historical cases, 30 Syntax observations, 11 SUCCEEDED/7 PARTIAL outcomes, false measurementEligible/sourceOrHistoryAuthenticated and null numericalPolicy/thresholds/newMeasurements. This is historical library conformance and byte-range grounding only; annotations are surface statements, not independent runtime/semantic truth or confidence calibration. M-02 measurements/observed outcomes remain null.

## Fresh reproducible evidence

All 3339 sealed predecessor hashes matched at start. Before snapshots preserve six allowed documents plus package.json. Source annotations froze in source-annotation-freeze.json before any checker implementation. Author script reads original Source bytes only, not captured events or an oracle; existing independent preproduct templates were reviewed before checker construction. Original Source/template/Fixture/capture files are unchanged.

Execution receipts/logs live in `.superpowers/sdd/2026-10-25-phase1-syntax-evidence-reuse/`:

| Check | Actual result |
| --- | --- |
| Missing script | r2-missing-script-red, exit 1 |
| Six named tests against callable wrong functions | r2-callable-red, exit 1; original stub preserved |
| Exact planned three-file local batch | r2-first-check, **17 passed**, 0 failed/cancelled/skipped |
| Direct report creation | r2-report, exit 0; one invocation, fixed new path, exclusive wx creation |
| Architecture | architecture, **17 projects passed**, exit 0 |
| Test mode with an existing report | post-report-readonly-test, **6 passed**, 0 failed/cancelled/skipped; report SHA unchanged |

The last focused batch was justified by a new state: the report had just been created. It verifies future root tests do not overwrite it. Counts are not summed as 23 unique tests; the first cohort has 17 unique named tests. No root-wide/488-test rerun, new build, Rust test or Native/acquisition/helper process was started.

## Implementation and review decisions

One new test-only script, one exact root-test suffix and one annotation document were added. No new manifest, dependency, runtime type/API, parser, mapper, selector, policy or product source. The script reuses instantiateProducerCase, validateCodeSyntaxObservationStream and consumeCodeSyntaxObservationStream. Old root paths are only substituted as literal strings using the existing template recipe; they are never opened as repositories. All file inputs are fixed, pinned regular paths under the repo with existing hard caps. Root/child layouts include exactly the retained cross-consumer result and four files per case. No caller root or environment path override exists.

The old checker CLI/function was not invoked or changed: its result writer and pre-result root layout were unsuitable for this completed capture. Existing guards/results remain intact. The new explicit read-only layout does not delete an old result, impersonate ownership or remove a guard.

Report schema was concretized within the approved internal-report scope: basis={inventorySha256,annotationsSha256,captureRoot}; case entries retain caseId/historicalOutcome/named checks. Source checks say GROUNDED_BYTE_RANGES_ONLY and SURFACE_ANNOTATIONS_ONLY, never a semantic truth verdict. The report is written only by direct no-argument invocation; import/test mode only runs assertions. A report failure produces a safe error code; wx prevents overwriting prior evidence.

Negative controls operate only on in-memory copies: altered bytes/hash, foreign/missing cases, invalid zero-based range and wrong literal, PARTIAL upgraded to SUCCEEDED, eligibility/authentication true, manufactured policy/thresholds/measurements and extra runtimeAdmission all reject. Current registry remains54/exact28/catalog0. All existing Fixture roots, M-01 corrected freeze, M-02 null fields, inventory and historical capture roots remain protected.

## Review Focus disposition

| Focus | Outcome |
| --- | --- |
| Historical data promoted to authority | Report/root schema fixes false eligibility/authentication and null numerical fields; mutation controls reject authority fabrication. |
| Old-root mutation or guard weakening | Fixed, pinned read-only paths and exact layout; old checker/result files untouched; existing report unchanged in test mode. |
| Source truth inferred from candidate output | Source-only annotations froze first; exact byte slices/coordinates checked. Runtime/dynamic/resolution truth remains UNDETERMINED where Source cannot justify it. |
| Partial or absent strata hidden | Seven PARTIAL cases preserved; distinct nested value/target/coverage counting units and eight named gap categories remain visible. |
| M-01/historical identity merging | M-01 provenance is a pinned contract reference only; no case-name/provider-ID join, Canonical origin merge or publication. |

No unresolved Important/Critical finding in the approved offline scope. This author's review does not establish independent review or merge readiness. No design contract change, new ADR/DCP or EVOLVABLE threshold adjustment was required.

## Remaining gaps / declined to judge

- ARTIFACT producer output; number/boolean/null value strata; EXACT/HEURISTIC/AMBIGUOUS/UNSUPPORTED target strata; duplicate OBJECT producer support remain absent in these historical captures.
- Independent representative dynamic truth, failure/cancellation qualification, Source/history/Stage/run authenticity, confidence policy and calibration remain unproven; inventory counts cannot substitute for them.
- Full H2/H3, product missing-policy refusal, H4/H5 and Phase1/P1-04/05 exits remain outside this package and OPEN/DESIGN_BLOCKED as applicable. No default/borrowed Code score was chosen.
- Historical C1 EPERM, four spent C2 lifetimes, Native timeout UNKNOWN, unqueried main cancellation settlement and R4 mutable-database restrictions persist.

Next decision: review these explicit limitations before proposing any numerical strategy or separately bounded new evidence operation. R-01 completion authorizes neither automatically. All original failures/seals/Source bytes are retained; no cloud/Git mutation occurred.
