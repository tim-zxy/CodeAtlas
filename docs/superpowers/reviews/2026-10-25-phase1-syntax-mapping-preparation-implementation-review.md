# Phase1 M-01/M-02 offline preparation implementation review

Date: 2026-10-25. Review type: AUTHOR_SELF_REVIEW, sequential in the existing worktree; no independent reviewer or subagent was used under the user's session constraint. This review approves only local preparation exits, not product readiness.

## Scope and result

[M-01](../plans/2026-10-25-phase1-syntax-mapping-preparation.md) T1–T3 and [M-02](../plans/2026-10-25-phase1-syntax-confidence-evidence.md) D1–D2 are complete within approved offline preparation scope. Exits: LOCAL_MAPPING_ORACLE_PREPARATION and LOCAL_CONFIDENCE_EVIDENCE_PLAN. Full H2/H3 remains DESIGN_BLOCKED; confidence numerical policy NOT_SELECTED. H4/H5 and full Phase1/P1-04/05 gates remain open.

Deliverables: [independent corpus](../../../fixtures/phase1/syntax-mapping-preparation/README.md), [assertion-only oracle](../../../scripts/test-syntax-mapping-preparation.mjs), [evidence protocol](../specs/2026-10-25-phase1-syntax-confidence-evidence-protocol.md), [31-row matrix](../specs/2026-10-25-phase1-syntax-confidence-evidence-plan.json) and [strict plan checker](../../../scripts/test-syntax-confidence-evidence-plan.mjs). The corpus has 34 cases in six families, six source files (five protected byte-identical copies) and three encoding-only probes. Ownerless ARTIFACT and duplicate OBJECT entries are explicitly schema-only. No complete Syntax envelope is manufactured.

## Fresh evidence

Execution workspace: `.superpowers/sdd/2026-10-25-phase1-syntax-mapping-preparation/`. Original plan-review receipt pinned 3096 files; all matched before work. The 3072 protected files outside the 24 authorized existing paths, including all 701 old Fixture files and compiled artifacts, matched before closure. Existing sources/build outputs remain reused unchanged; no build ran.

| Check | Actual result / receipt |
| --- | --- |
| Missing loader and callable wrong-loader controls | exit 1 each; m01-api-red / m01-behavior-red |
| M-01 focused four files | 101 passed, no skip; m01-first-green-attempt |
| M-02 missing-file / wrong-readable-plan controls | exit 1 each; m02-api-red / m02-behavior-red |
| M-02 validator | 5 passed; m02-green |
| Corrected coordinates plus both new checkers | 11 passed; corrected-focused-green |
| Exact planned 16-file combined closure | 488 passed, 0 failed/cancelled/skipped; combined16 |
| Architecture | 17 projects passed, exit 0; architecture |

The joint batch ran once. A preceding orchestration typo used the wrong JSON property name; no test started in that attempt. Its cause/fix is retained in closure-dispatch-key-error.json. This is not a failed test batch or a hidden retry. No root-wide regression, calibration or profile run occurred.

## Review findings and corrections

Important Fixture-authoring defect found and corrected: initial annotations incorrectly used one-based lines. Existing retained Java/Unicode producer examples establish zero-based lines and UTF8 byte columns. The first freeze and every original semantic file were preserved under first-freeze-raw. coordinate-defect.json records the cause; coordinate-red proves the original inconsistency. A separately authored correction updated coordinates, exact Source slices and key preimages without importing the oracle. semantic-freeze-corrected.json is the successor authority; semantic-freeze.json remains the immutable superseded receipt. Matrix basis now pins the corrected provenance. No frozen contract or numerical policy changed.

The checker now asserts zero-based coordinates, exact literal slices, strict input/expected field sets and selected typed binding closure. In-memory source/ref/key/policy/numeric corruption must fail. The matrix checker rejects missing/foreign cases, wrong hashes, owner flips, dynamic inference from UNKNOWN, non-null numbers/measurements/observed outcomes and extra runtimeAdmission fields. Frozen files are never corrupted for tests.

## Review Focus disposition

| Focus | Reviewed evidence and implication |
| --- | --- |
| Projection versus Canonical gate | Every positive projection is BLOCKED_POLICY/canonicalEnvelope=null; strict IR payload member schemas are used without confidence. This is declaration consistency, not a future Runtime gate test. |
| Surface Source and producer claims | Explicit provenance, copied hashes, exact slices; unsupported synthetic cases remain schema-only. Source literal support does not prove emitted producer output or reference resolution. |
| Ambiguity and original bindings | Independent callee-collapse stays NON_RESOLVED; value-collapse rejects INCOMPATIBLE_CONTRACT; loser binding maps through original typed refs; same-name different IDs stay distinct. |
| Identity and original/current separation | Provider/revision invariance, changed payload, UTF16 object ordering, numeric object keys and framed delimiter/empty/Unicode vectors checked with existing primitives. Equal syntaxKey does not merge origins or confer authority. |
| Registration | Exactly two root test suffixes; one manifest yields 54 total/28 Phase1; catalog0 retained. Three old oracles change only title and two structural assertions, retaining old IDs. |
| Missing measurements | Matrix values remain null; protocol marks prospective metrics NOT_COLLECTED. Counts do not assert sample sufficiency. |
| Owner-null/UNKNOWN | No borrowed Code score; UNKNOWN remains UNDETERMINED without source-dynamic evidence. |
| Probe exclusion | Exactly three identity encoding probes excluded; other identity-invariance mapping declarations remain included. |
| Policy boundary | No production import/export/type, policy implementation or Runtime capability was added. |

No unresolved Important/Critical finding within the preparation scope after correction. This remains an author's review, weaker than an independent review and no basis for merge approval.

## Declined to judge / still open

- Actual extraction agreement, dynamic Source representativeness, partial/unsupported/cancelled runtime outcomes: not collected; protocol lists these evidence gaps.
- Numerical confidence meaning/values and calibration: not selected or authorized; separate evidence and explicit approval required.
- Product mapper, complete Canonical Syntax, Runtime policy refusal and H2/H3 integration: not implemented by these packages.
- H4/H5 storage/Stage/run qualification and full Phase1 exit: outside approval, original gates preserved.
- Cloud CI/main cancellation settlement and historical Native timeout: no cloud operation authorized here; timeout remains UNKNOWN. C1 EPERM, four spent C2 lifetimes and R4 mutable-database restrictions persist.

Next decision is review of the evidence protocol and exact separately scoped evidence operation (or reuse of existing immutable artifacts). This review does not authorize a Native run, calibration, dependency, numeric policy, cloud/Git action or H2–H5 implementation.
