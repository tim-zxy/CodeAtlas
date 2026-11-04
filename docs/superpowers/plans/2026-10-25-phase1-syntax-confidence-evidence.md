## M-01/M-02 offline preparation accepted locally — 2026-10-25

User explicitly approved both offline preparation packages. M-01 T1–T3 and M-02 D1–D2 are complete only as LOCAL_MAPPING_ORACLE_PREPARATION / LOCAL_CONFIDENCE_EVIDENCE_PLAN. [Corpus](../../../fixtures/phase1/syntax-mapping-preparation/README.md), [evidence protocol](../specs/2026-10-25-phase1-syntax-confidence-evidence-protocol.md) and [author implementation review](../reviews/2026-10-25-phase1-syntax-mapping-preparation-implementation-review.md) record the exact scope and gaps. This current entry supersedes the historical planning-pending/not-started entries preserved below; it does not authorize product H2–H5 or a numerical confidence policy.

Fresh exact 16-file local closure: **488 passed, no failed/cancelled/skipped**, architecture **17 projects passed**. Registry **54 total / 28 Phase1 / catalog0**. All 3096 predecessor hashes matched at start; 3072 protected files including all 701 old Fixture files and existing compiled artifacts remain unchanged. Two root tests and one Fixture were added; three old oracles have only three structural substitutions each. The 34 cases/31 classification rows are declarations, not measured observations or sample-sufficiency gates. All measurements, thresholds and numericalPolicy remain null.

Evidence: `.superpowers/sdd/2026-10-25-phase1-syntax-mapping-preparation/implementation-verification.json`, exact logs, original document snapshots and freezes. An authoring coordinate defect was diagnosed with retained producer examples, proved RED and corrected under an explicit successor freeze; the first raw corpus/freeze remains preserved. No product source/schema/migration/dependency/profile/build/DB/Native/calibration/cloud/Git mutation occurred. Review was author-only under the sequential constraint. H1 local acceptance stands; full H2/H3 DESIGN_BLOCKED, H4/H5/Phase1/P1-04/05 gates OPEN, confidence policy NOT_SELECTED. C1 EPERM/C2 lifetimes spent/Native timeout UNKNOWN/main cancellation settlement unqueried/R4 mutable DB restrictions persist. Next: review the evidence protocol before separately approving any actual evidence operation or numerical strategy.

Task closure: D1, D2 complete within approved offline scope; original checklist below is the preserved pre-execution plan, not current task status.

# Phase1 M-02 Syntax Confidence Classification and Evidence Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans in the existing session,sequentially;TDD only for the offline evidence-plan validator. No subagent,new worktree,commit or cleanup defaults.

**Goal:** Produce a source-linked confidence feature matrix and a reviewable evidence-collection protocol, without selecting scores, collecting new observations or enabling a policy.

**Architecture:** Read the frozen M-01 corpus,write a document and a machine-checkable evidence plan,then check completeness/provenance with a test-only Node script. No model fitting,policy implementation,Runtime catalog or probability inference. Null observed/numeric fields truthfully mean not collected/not approved.

**Tech Stack:** Existing Node/assert/node:test/fs/crypto and frozen M-01 loader;no build/dependency/DB/Native/LLM/network.

**Spec:** [Accepted mapping direction](../specs/2026-10-25-phase1-syntax-mapping-confidence-design.md), [M-01 exact corpus plan](2026-10-25-phase1-syntax-mapping-preparation.md).

**Status:** Concrete plan REVIEW_PENDING; D1/D2 NOT_STARTED. Local Exit only LOCAL_CONFIDENCE_EVIDENCE_PLAN. A plan is not a measured result or an approved scoring strategy.

## Global constraints

All M-01 worktree/security/phase/source/CI constraints apply. User approved planning only. No confidence score/default/weight/Quality threshold,calibration/profile,real Native/acquisition helper or cloud/Git action. Do not use Code confidence or old structural fixture scores as Syntax policy evidence. Policy/version tokens are not authority. Owner-null,unknown and ambiguity cannot be hidden by a lower score.

M-02 adds no Fixture manifest;registry remains the M-01 resulting54/exactPhase1 28/catalog0. It appends exactly one root test only after execution approval. No product source,IR,Provider wire,SQL or Stage/Store changes.

## Review Focus

1. NOT_COLLECTED becomes zero failures or passing measurements:all observed/numeric sections stay null and explicitly not-collected.
2. OWNER_NULL/ARTIFACT gets borrowed Code confidence:classification only;no default policy or eligible-runtime flag.
3. UNKNOWN is automatically called dynamic based on its reason text:dynamic claims require Source annotations;otherwise UNDETERMINED.
4. Identity probes are counted as observations/denominators:exclude the exact three encoding-only cases,not the declared mapping cases that test identity invariance.
5. A policy/data file becomes a Runtime loader:document-only schema and tests;no exports/imports to production,no approved values or permission DTO.

## Exact files and interface

Create:

- `docs/superpowers/specs/2026-10-25-phase1-syntax-confidence-evidence-protocol.md`;
- `docs/superpowers/specs/2026-10-25-phase1-syntax-confidence-evidence-plan.json`;
- `scripts/test-syntax-confidence-evidence-plan.mjs`.

Append only that script to `package.json` after M-01's one-path suffix. Update this plan,combined author review and the same15 governing documents as evidence status requires. No old Fixture or numeric baseline changes.

Plan JSON root exactly: `{schemaVersion,status,basis,rows,numericalPolicy,thresholds,measurements,nextDecision}`. Values:schemaVersion=1,status=EVIDENCE_PLAN_ONLY,numericalPolicy=null,thresholds=null,measurements=null,nextDecision=REVIEW_EVIDENCE_PROTOCOL_BEFORE_ANY_EXECUTION.

basis exactly `{fixtureId,provenanceSha256,mappingContract}`;fixtureId=p1-syntax-mapping-preparation-v1,hash binds the actual T1 provenance after approval,mappingContract names the accepted mapping annex. This is a document reference,not a captured RepoBasis or authentication token.

Each row exactly `{caseId,provenanceClass,sourceRefs,sourceHashes,syntaxKind,ownerState,resolutionClasses,hasUnknown,dynamicGrounding,expectedSemanticDisposition,observedSemanticDisposition}`. ownerState=PRESENT/NULL;resolutionClasses are unique existing raw resolution labels or NO_REFERENCE;dynamicGrounding=SOURCE_ANNOTATED_DYNAMIC/STATIC_SYNTAX_ONLY/UNDETERMINED;expectedSemanticDisposition follows literal M-01 expected;observedSemanticDisposition=null. sourceRefs is an ordered array of Fixture-relative source paths;sourceHashes is a string-to-SHA256 object with exactly those paths as keys. Rows follow cases.json order with only the three exact probes removed. resolutionClasses uses sorted unique existing label strings,or the singleton [NO_REFERENCE]. No scoring,probability,weight,capability/authorization or runtime-admitted property.

Rows cover every M-01 raw mapping case exactly once. Exclude only unicode-key-order,integer-key-order,extraction-version-encoding as IDENTITY_ENCODING_ONLY. All input/expected raw observations remain component declarations,not actual Native runs. Validate row features against the frozen declarations and cited Source annotations;do not infer semantic truth.

## Task D1 — Source-linked feature matrix and collection protocol

**Consumes:** M-01 T1 semantic freeze/case IDs/provenance. Taxonomy prose can be drafted independently;final rows depend on the actual frozen corpus,so no independent execution lane. **Produces:** the two exact evidence-plan files with no measurements.

- [ ] Bind the actual frozen M-01 provenance hash and all included case source hashes. Include all31 mapping declarations (34 planned cases minus three encoding probes);this is a structural count,not a sample-size sufficiency gate. Fail on missing/duplicate/foreign case IDs. If corpus changes legitimately under a successor freeze,synchronize explicit metadata and preserve old records rather than silently treating different inputs as equal.
- [ ] Record syntaxKind/owner/raw resolution classes/UNKNOWN directly from declared inputs. Assign dynamicGrounding only from explicit Source annotations,not method names or UNKNOWN free text. Include both expected-success and expected-rejection controls;never promote a rejection into low-confidence success.
- [ ] Write a protocol answering:what each future score would mean;how independent source/expected truth is established;how owner-null/static/dynamic/ambiguous/unsupported/partial cases are reported;how source/extractor/mapper/policy versions and permission/freshness are bound;how failures/cancellations/not-run are retained. Reuse existing immutable Source/holdout evidence;no recapture or downloads now.
- [ ] Specify prospective report fields for field agreement,Source grounding,reference closure,omissions and per-kind/parse-state outcome. Mark them NOT_COLLECTED and do not assign performance/confidence pass thresholds. Explain why the classification itself does not validate confidence calibration.
- [ ] List the next separate decision:review exact evidence-collection purpose,inputs,operation,expected run count/job scope and alternatives before any real run;review candidate numerical policy with evidence before enabling it. Do not preauthorize a Native run,cloud batch,profile installation or remote processing. Missing policy continues to block Canonical Syntax/H2/H3.

**Completion:** complete source-linked classification plus a concrete collection/report/review protocol;all numeric and observed outcomes remain null. It is a ready-to-review evidence plan,not scoring evidence.

## Task D2 — Offline validator,root registration and combined evidence

- [ ] Write test names and exact assertions first:`evidence plan covers all declared mapping cases but no encoding probes`,`features and source hashes match frozen corpus`,`unknown is not implicitly dynamic`,`numeric or observed result is never manufactured`,`new test registers exactly once`. Observe missing-file/APIRED separately;then corrupt an in-memory copied plan (missing row,foreign case,wrong hash,owner flip,non-null numericalPolicy={},measurements={},unknown extra runtimeAdmission=true) and observe rejection. Never mutate frozen files to exercise negatives.
- [ ] Implement the single test-only script using Node assertions and M-01 data loader. Strictly check the root/row field sets,enums,hashes,null states,exact coverage and expected-disposition consistency. No product policy evaluator or new runtime type. Error messages contain safe case IDs/codes,not unrestricted literal data.
- [ ] Append one test path to the existing package test command;no manifest/count changes. Run `node --test scripts/test-syntax-confidence-evidence-plan.mjs`. Expected:exit0,all named checks/no skips;read actual totals.
- [ ] For combined execution,run the exact16-file command and architecture command in `.superpowers/sdd/2026-10-25-phase1-syntax-mapping-preparation/planned-local-commands.json` once after M-01/M-02 changes. No new build/DB/actualNative tests;the original1467 full local H1 proof remains historical and is not rerun without reason.
- [ ] Verify only the declared source-free preparation files changed;old701 Fixture bytes remain unchanged,new M-01 semantic freeze matches,root string has exactly two new paths and only three old structural oracle substitutions. Check formatting/links/source provenance/primitive encodings. Update statuses with LOCAL_CONFIDENCE_EVIDENCE_PLAN and the final author review;preserve original document suffixes/all failures and seal exact command/hash receipts.

**Completion:** machine-checkable plan/oracle and linked documentation,all relevant preparation gates pass. Numerical strategy is still NOT_SELECTED;no complete normalizer/H2/H3,Stage,Store,run qualification or Phase1 completion follows.

## Sequential order and next executable action

Default combined order: M-01 T1 → T2 → D1 → D2 → common closure (M-01 T3). Authoring/verification errors are fixed at their source with original evidence retained;no test weakening. Only taxonomy reading is truly independent. The first executable action remains M-01 baseline preservation/literal authoring after explicit package approval.

Request review of the two concrete preparation packages together. If approved,authorization covers only Fixture/literal and offline test code plus evidence-plan documents and the exact local checks. Product coding,numerical decisions,calibration/actualNative,H4/H5,dependencies/cloud and Git writes remain separate.
