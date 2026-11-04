# Syntax measurement preparation and unresolved run gates

Status: preparation under accepted admission/traversal designs and user continuation. No actual Native run, calibration, numerical installation, new dependency or cloud operation is authorized. This document does not introduce a new accepted measurement contract or a ready-to-run manifest.

## Bounded outcome

The pure compareSyntaxObservationOutput(requestValue, actualBytes, oracleBytes) tool reuses the existing strict v4 decoder and current request/client hard caps. It validates both complete streams, including their individual raw-byte checksum, and compares every event/payload in sequence. Only the already-validated terminal checksum value is excluded from semantic equality so JSON key ordering alone is harmless; both complete raw-byte SHA256 values remain in the result. No array sorting, selected-probe matching, ID/range/owner erasure, coverage/diagnostic suppression or numeric tolerance. Errors are fixed codes without raw payload values. A match record is CONTRACT_ORACLE_MATCH_ONLY: it cannot approve a run, authenticate an independent oracle author, install a profile or publish facts.

The four existing budget-contract literal streams exercise the checker. They are not complete expected results for the eight calibration and eight holdout Source cases. The old offline Source/probe catalog and every historical Fixture remain unchanged. New actual full oracles must be authored independently from Source/design and frozen before an observer run; never copy an observed producer result into expected output.

## Remaining concrete artifacts

| Artifact | Required proof | Current state / dependency |
| --- | --- | --- |
| Actual full v4 wire oracles | Exact Provider nodes/edges, Syntax observations/values, range/owner/ref, coverage/diagnostics, terminal binding/counts and raw expected identity for each actual case | SOURCE-REFERENCE COVERAGE16/16:all eight calibration/holdout Source classes have complete strict unit wire references. Actual authenticated measurement requests remain OPEN;6 unit ABSENT/PRESENT shape differences require rebind. Old corpus probes remain unchanged |
| Canonical result oracle | Independent normalized Code identities/endpoints and Syntax owner/support binding; no provider-ID dependence | PARTIAL: initial/static/dynamic-malformed/nested/bounded/changed-only pairs have complete pure Code references,and Java/mixed have exact declaration-owner Canonical references with actual symbol cross-checks;the complete Java Code graph is still OPEN; Canonical Syntax/support and Store results remain OPEN |
| Exact requests and resources | Frozen request/context/Source inventories, removed files, all existing explicit budget fields including maxItems; requested/effective worker policy; per-case purpose and predicted terminal | OPEN; no guessed default, event-to-work multiplier, profile value or unapproved threshold |
| Actual HOST composition | Same built strict owner/request validation, real low-level transport/buffering/complete decoder, Python normalization and retained result lifetimes intended for admission | OPEN; collector helper conformance and the offline checker are not a measured HOST workflow |
| Native process acquisition | OS lifetime PeakWorkingSetSize for the very child created by the actual transport, retained handle and after-exit final read; exact PID/lifetime/exit bound to output | OPEN; current PowerShell owns only its Node helper, while native-client runProcess owns Native. No implemented bridge. A changed launch owner/wrapper/hook or purpose/metric/accounting requires design review before implementation |
| Error and lifecycle matrix | Immediate exit, success/PARTIAL, controlled failure, corruption/truncation, changed/link Source, cancel/timeout/broken pipes; drain/await/owned process cleanup and no overlap | OPEN for actual Native; fake-child and owned-helper results remain separately labeled |
| Exact evidence/run package | Hashes of executable, built implementation, lock/toolchain/grammars, source, full oracles, requests/resources and acquisition tool; exact commands, owned output root and approved repetitions/scope | OPEN; no run request until the package is concrete and reviewable |
| Candidate/holdout/accounting | Keep accepted separate HOST/NATIVE peaks, required repetitions, independent holdout without tuning, safe reservation sum and any live provisional Java/Store overlap | OPEN; existing profile parser contract is not measurement or whole-composition admission |

## Dependency and next work

1. Initial-absent Python calibration/holdout full Source-literal wire and pure Canonical Code expectations are now independently authored,pre-frozen and library/cross-consumer verified. Their repo/stage/final context and resource controls remain explicitly synthetic unit data; actual Runtime capture/run contexts are still OPEN. See [review](../reviews/2026-10-22-phase1-initial-absence-oracle-review.md).
2. Present-activation python-static pair is now pre-frozen and library/cross-consumer verified with active/provisional/final refusal controls. Java exact-owner pair and ownerless controls are also pre-frozen and library/cross-consumer verified. The combined Java/Python provisional-owner pair is now pre-frozen and library/cross-consumer verified,including inventory reversal and second-file failure. Dynamic/malformed pair is also independently pre-frozen and verified with UNKNOWN values,warning retention and PARTIAL. Nested-source pair is also independently pre-frozen and verified with exact qualification/self-owner and COMPLETE extraction. Bounded-output pair now has full independent success/failure references and exact-derived boundary evidence. Changed-only-restart Source pair is also pre-frozen and library/cross-consumer verified;actual new-process restart and persisted removal/recovery remain OPEN. A combined Syntax stream is not atomic Code+Syntax Store proof. This proceeds independently of actual OS acquisition,within the existing sequential session. See [review](../reviews/2026-10-22-phase1-present-activation-oracle-review.md).
3. Resolve the actual process-handle acquisition/transport-lifetime design before implementing that bridge. Preserve the approved OS lifetime metric and actual shipped transport identity; PID polling/current working set, measured helper substitution, unaccounted wrapper or a pre-exit snapshot cannot close the gate.
4. Freeze the actual Host composition and resource/run manifest once all dependent artifacts exist. Present exact scope for separate actual-run approval; preserve every failure and do not retry to green. Profile number review/installation remains a later separate decision.

P1-04/05 and all Phase1 exits remain open. SQLite authoritative, Canonical IR, LLM candidate-only, AUTO/MANUAL boundaries, ExecutionGraph -> RuntimeFlow -> BusinessFlow and deferred-phase scope remain unchanged. This internal checker needs no ADR change: it changes no wire/Canonical/schema/profile parser or approved gate; its coverage is traced to the existing budget-contract Fixture.


Java checkpoint: [review](../reviews/2026-10-22-phase1-java-owner-oracle-review.md). Metadata-only formatting after initial library comparison preserved Source,request/raw-stream and expected Canonical/symbol values;both freeze receipts and structural equality are retained. No actual run/profile gate is closed.


Mixed checkpoint: [review](../reviews/2026-10-22-phase1-mixed-provisional-oracle-review.md). All reference bytes were formatted and frozen before first library comparison and remain unchanged. Four complete streams and one failed stream plus two symbol sets pass cross-consumer checks;8/16 Source cases have controlled reference oracles. No actual run/profile gate is closed.


Dynamic/malformed checkpoint:[review](../reviews/2026-10-22-phase1-dynamic-malformed-oracle-review.md). Full recovered Code/Syntax/diagnostic reference,not valid Source or canonical publication.10/16 Source cases have controlled references;remaining6 and actual context/process/resource/profile gates remain open.


Nested checkpoint:[review](../reviews/2026-10-22-phase1-nested-source-oracle-review.md).12/16 controlled Source-case references;remaining4 and actual process/context/resources/profile gates open. User requests consolidated cloud CI later;candidate checkpoint is integrable P1-04/05 plus passing applicable local gates,followed by exact CI scope/head confirmation. No actual Native or cloud run is started.


Bounded-output checkpoint:[review](../reviews/2026-10-23-phase1-bounded-output-oracle-review.md).14/16 controlled Source references;complete41502-byte streams are not memory reservations. Existing test allowance and output-derived boundary values do not qualify actual run/resource manifests. Actual process/context/profile/Store gates and cloud CI deferral remain.


## Full Source-reference coverage,not run qualification — 2026-10-23

[Changed-only review](../reviews/2026-10-23-phase1-changed-only-oracle-review.md) and retained task-04-source-reference-index.json/check.mjs cover16/16 original Source identities and strict full unit references.6 cases (dynamic-malformed,nested-source,bounded-output calibration/holdout) intentionally used ABSENT unit contexts while original request shapes require PRESENT. Do not promote these requests into measurement inputs;all16 need actual trusted context/resource/run binding. Removed metadata is outside the current owner-map context/digest and must remain authenticated by the eventual request/Apply workflow. Actual new-process restart,OS handle/peak/lifecycle,HOST composition,whole Java/mixed Code graph,Canonical Syntax/support/CAS/Store gates remain OPEN.

Next independently progress actual Runtime/Source/provisional-stage capture design and actual transport-owned Native handle acquisition design. Any launch-owner/wrapper/hook/metric/accounting change must be reviewed before implementation;no automatic Native run or cloud CI follows from16/16 Source-reference coverage.


## Next design checkpoint pending approval — 2026-10-23

[Staged proposal](2026-10-23-phase1-trusted-context-and-process-acquisition-proposal.md) and [author review](../reviews/2026-10-23-phase1-trusted-context-design-review.md) document real call paths and three acquisition options. Recommended next scope is draft-only manifest checks plus at most4 owned Node-helper external-handle feasibility cases;not product capture/bridge or actual Native. No implementation,helper run,measurement or profile decision follows until direction is confirmed.16-case context/resource/fullgraph/Store/process gates remain unchanged.


## Direction accepted;concrete plan ready for review — 2026-10-23

User approves stagedC1/C2 direction. [Plan](../plans/2026-10-23-phase1-trusted-context-preparation.md) fixes exact identities,always-NOT_READY report,Fixture/security/18-file regressions and4 one-shot ownedNode cases. A newly found rawFixturecheckout risk is addressed only as pendingC0-byte plan detail. No code/attribute/helperrun changes;all actual Runtime/context/resource/process/Store gates remainOPEN.


## Concrete plan approved and preparation executed — 2026-10-23

The user confirmed the written implementation plan. [Implementation author review](../reviews/2026-10-23-phase1-trusted-context-implementation-review.md) supersedes plan-pending language:C0-byte applied;C1 implementation/tests/independent Fixture present,with real file symlink EPERM as explicit OPEN validation gate;final340 PASS/1 TODO across18 files;C2 exactly4 one-shot owned helpers completed with verified closes/releases. Helper feasibility never qualifies actual Native or profile. All existing P1-04/05/phase exits,actual capture/stage/removal/Store/accounting gates remainOPEN;catalog0,cloud CI deferred,timeout UNKNOWN. [C3 preparation brief](2026-10-23-phase1-trusted-capture-next-design-brief.md) is not implementation/run authority. Four helper slots spent;no retry.
