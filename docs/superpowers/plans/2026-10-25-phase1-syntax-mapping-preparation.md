## M-01/M-02 offline preparation accepted locally — 2026-10-25

User explicitly approved both offline preparation packages. M-01 T1–T3 and M-02 D1–D2 are complete only as LOCAL_MAPPING_ORACLE_PREPARATION / LOCAL_CONFIDENCE_EVIDENCE_PLAN. [Corpus](../../../fixtures/phase1/syntax-mapping-preparation/README.md), [evidence protocol](../specs/2026-10-25-phase1-syntax-confidence-evidence-protocol.md) and [author implementation review](../reviews/2026-10-25-phase1-syntax-mapping-preparation-implementation-review.md) record the exact scope and gaps. This current entry supersedes the historical planning-pending/not-started entries preserved below; it does not authorize product H2–H5 or a numerical confidence policy.

Fresh exact 16-file local closure: **488 passed, no failed/cancelled/skipped**, architecture **17 projects passed**. Registry **54 total / 28 Phase1 / catalog0**. All 3096 predecessor hashes matched at start; 3072 protected files including all 701 old Fixture files and existing compiled artifacts remain unchanged. Two root tests and one Fixture were added; three old oracles have only three structural substitutions each. The 34 cases/31 classification rows are declarations, not measured observations or sample-sufficiency gates. All measurements, thresholds and numericalPolicy remain null.

Evidence: `.superpowers/sdd/2026-10-25-phase1-syntax-mapping-preparation/implementation-verification.json`, exact logs, original document snapshots and freezes. An authoring coordinate defect was diagnosed with retained producer examples, proved RED and corrected under an explicit successor freeze; the first raw corpus/freeze remains preserved. No product source/schema/migration/dependency/profile/build/DB/Native/calibration/cloud/Git mutation occurred. Review was author-only under the sequential constraint. H1 local acceptance stands; full H2/H3 DESIGN_BLOCKED, H4/H5/Phase1/P1-04/05 gates OPEN, confidence policy NOT_SELECTED. C1 EPERM/C2 lifetimes spent/Native timeout UNKNOWN/main cancellation settlement unqueried/R4 mutable DB restrictions persist. Next: review the evidence protocol before separately approving any actual evidence operation or numerical strategy.

Task closure: T1, T2, T3 complete within approved offline scope; original checklist below is the preserved pre-execution plan, not current task status.

# Phase1 M-01 Independent Syntax Mapping Preparation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans in this existing session, sequentially; TDD for the new offline checker. User overrides subagent/worktree/commit/cleanup defaults. Preserve all old evidence.

**Goal:** Prepare independent nonnumeric Syntax mapping Fixtures and a read-only offline consistency oracle, without implementing a product mapper or approving any confidence score.

**Architecture:** Freeze literal source/expected projections first, then add a small data loader and an assertion-only oracle. Reuse existing IR payload/ref schemas and identity primitives; no second normalizer, production policy API or database workflow. Registration changes are limited to one new Fixture, one root test and three exact old structural counters.

**Tech Stack:** Existing Node/node:test/assert/fs/crypto, installed IR/Providers/Evaluation/Runtime artifacts, current formatter; no dependencies or rebuild required while pinned artifacts match.

**Spec:** [Accepted mapping direction](../specs/2026-10-25-phase1-syntax-mapping-confidence-design.md), [accepted history/Stage DCP](../specs/2026-10-25-phase1-r011-history-stage-contract.md), [M-02 plan](2026-10-25-phase1-syntax-confidence-evidence.md).

**Status:** Concrete plan REVIEW_PENDING; T1–T3 NOT_STARTED. User approved direction and task-package refinement only, not this execution. Local Exit may only be LOCAL_MAPPING_ORACLE_PREPARATION; H2/H3 remain blocked on numerical-policy evidence/approval and later implementation.

## Global constraints

- Existing C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas, HEAD cc5a8cb571986c5e56ed04053b2c96ef500fcacb. D checkout/local EOL changes remain untouched. No .codegraph, do not index.
- No packages/*/src, Rust, SQL, migration manifest, Runtime route, public API, selector, confidence number/default/threshold, dependency/lockfile or profile change. No DB open, process helper, Native/acquisition helper, calibration, cloud operation, Git write, new worktree/session/agent or cleanup of historical evidence.
- All source and old Fixture bytes remain protected. A copied source is preserved byte-for-byte with original path+hash; schema-only declarations are explicitly marked, never claimed as real producer output or language/framework maturity.
- Provider-independent IR/SQLite authoritative/LLM candidate-only/AUTO-MANUAL/ExecutionGraph→RuntimeFlow→BusinessFlow/Deferred gates remain unchanged. No Canonical SyntaxEnvelope is returned or published.
- Reference scripts may serialize explicit authored literals and compute ordinary source/framed identity hashes. They cannot import a new mapper/selector/writer to generate expected values. Do not run old authoring scripts against old roots.
- Existing53/exactPhase1 27/catalog0 is the verified starting registry. One new manifest implies prospective54/28/catalog0; these are structural totals, not Quality thresholds or current passed results.

## Review Focus

1. A payload projection without confidence is accidentally presented as valid Canonical Syntax or missing-policy enforcement: every positive case explicitly has canonicalEnvelope=null and BLOCKED_POLICY; oracle cannot claim to test a nonexistent product gate.
2. Source-grounded expectations are mistaken for actual extractor support, especially ownerless ARTIFACT and duplicate OBJECT entries: case-level provenance and Source/hash/span records are mandatory.
3. Candidate coalescing silently upgrades resolution: independent callee-collapse and value-collapse cases preserve NON_RESOLVED versus reject unrepresentable AMBIGUOUS.
4. Provider/revision/provenance changes alter occurrence identity: independently pinned source/meaning/key projections test provider/revision invariance and payload changes; identity probes are not observations.
5. Updating registry totals changes unrelated numbers or erases old checks: only three identified titles/count assertions may change; all old IDs and catalog0 checks remain.

## Exact files

Create fixture root `fixtures/phase1/syntax-mapping-preparation/` with:

- fixture.json, cases.json, provenance.json, README.md;
- cases/<case-id>/input.json and expected.json for the34 named cases in `.superpowers/sdd/2026-10-25-phase1-syntax-mapping-preparation/planned-cases.json`;
- sources/Endpoint.java, app.py, dynamic.py, unicode.py, repeated.py, artifact.yml;
- corpus.mjs, a test-only data loader added after the semantic freeze.

Create `scripts/test-syntax-mapping-preparation.mjs` only for the read-only oracle. Modify `package.json` by appending exactly that path to the existing test string. Modify only structural title/registry total/exactPhase1 total in `scripts/test-history-transition.mjs`, `scripts/test-delta-support-candidate.mjs`, and `scripts/test-r011-history-capture.mjs`:53→54 and27→28; no other27, resource/profile/corpus number or old check changes.

Governance updates are limited to the accepted mapping annex, ADR-020, CURRENT_STATUS/DESIGN_AUTHORITY/WBS/PHASE_ACCEPTANCE/DESIGN_TRACEABILITY, relevant IR/Provider/Evaluation/Security/SQLite/native scalability notes, this plan and the final author review. Preserve their original raw suffixes. No new ADR is required unless implementation exposes an actual frozen-contract conflict; stop that scope if so.

Evidence workspace: `.superpowers/sdd/2026-10-25-phase1-syntax-mapping-preparation/`. Keep pre-execution originals, all RED/failures, authoring scripts, semantic-freeze.json, exact command receipts and implementation-verification.json. Do not commit .superpowers or .pnpm-store.

## Fixture and helper interfaces

Manifest exactly schemaVersion1/id=`p1-syntax-mapping-preparation-v1`/category=`code-intelligence`/phase=`1`/languages=[]/frameworks=[]/capabilities=[SYNTAX_MAPPING_PREPARATION_ONLY]/criticalFacts=[]/qualityGates={}. Inputs point to cases.json, sources/ and provenance.json; expected points to cases.json. Do not advertise real parsing/capture/publication.

Case metadata exactly `{id,family,input,expected,provenanceClass,sourceRefs}`. Families: KIND,VALUE,REFERENCE,SOURCE_OWNER,IDENTITY,POLICY. provenanceClass is SOURCE_LITERAL_EXPECTATION, SCHEMA_CONTRACT_ONLY, NEGATIVE_ONLY or IDENTITY_ENCODING_ONLY.

Mapping input is an offline declaration tagged `SYNTAX_MAPPING_PREPARATION_INPUT`, with repositoryId/revisionId/providerId, full SourceFile, raw observation, selectedNodes, typed ProviderNode→Canonical-id bindings, extractorVersion and mapperVersion. No numerical policy is accepted. Identity probes use `IDENTITY_ENCODING_INPUT`, explicit primitive fields and literal encoding expectations; no fake policy installation. The three probe IDs are exactly unicode-key-order,integer-key-order,extraction-version-encoding. artifact-ownerless and value-object-duplicates must be SCHEMA_CONTRACT_ONLY,not an assertion of current producer support. artifact.yml uses the existing OTHER/AUTHORED/TEXT Source classification;do not invent a CONFIG role.

Positive expected is tagged `MAPPING_PROJECTION_EXPECTATION`, containing the nonnumeric common fields/owner/payload projection, requiredEntities, explicit keyMeaning, canonical key-meaning text/digest/key, admission=`BLOCKED_POLICY`, canonicalEnvelope=null. It has no Syntax confidence/extractionVersion output. A rejected semantic case contains its precise expected mapping-layer cause and canonicalEnvelope=null; it does not assert production error precedence. Original copied Code confidence is input provenance only, never Syntax scoring.

For extraction-version-encoding, policyVersion is a literal token marked UNAPPROVED_ENCODING_ONLY; expected only proves the approved framed encoding. It cannot be consumed as a confidence policy or Runtime capability.

`corpus.mjs` exports `cases: readonly CaseMetadata[]`, `loadMappingCase(id): {metadata,input,expected}`, `sha(bytes): string`. It imports only Node standard library, returns data and generates no expected/payload/normalized Syntax. No referenceMapping production-like algorithm, unsafe flag or generic policy framework.

## Task T1 — Independently freeze34 literal cases and source provenance

**Consumes:** accepted mapping annex, planned-cases identifiers and immutable existing source examples. **Produces:** strict manifest/data/provenance plus semantic-freeze.json. No oracle, registration or source implementation yet.

- [ ] Read copied source and exact existing Source/owner declarations before authoring. Copy Endpoint.java from syntax-java-owner-oracle/calibration; app.py from code-syntax-producer-oracle/cases/mixed; dynamic.py from dynamic-python; unicode.py from unicode-control; repeated.py from nested-repeated-values. Record original and copied SHA. Create artifact.yml as an explicitly SCHEMA_CONTRACT_ONLY literal, without invoking a parser or interpreter. If a selected source cannot support a proposed span/value, mark that case SCHEMA_CONTRACT_ONLY; never claim observed producer support.
- [ ] Author the following full input and nonnumeric expected literals, independently of a future product mapper. Include all nested values and source/ref identity, not digests alone.

| Family | Exact case IDs / required assertions |
| --- | --- |
| KIND | decoration-java, invocation-python, declaration-java, assignment-python, artifact-ownerless:all five payload shapes;ARTIFACT owner=null with Source required |
| VALUE | value-string, value-number, value-boolean, value-null, value-reference-exact, value-reference-heuristic, value-array, value-object-duplicates, value-unknown:kind/value/order preserved;OBJECT entries stay an array;no evaluation or new score |
| REFERENCE | reference-ambiguous-two, callee-collapse-one, value-collapse-reject, reference-unresolved-zero, reference-unsupported-zero, reference-missing-binding, reference-not-selected, reference-loser-binding, reference-same-name-different-id:every original typed ref,selected closure,and approved collapse behavior |
| SOURCE_OWNER | owner-not-selected, source-fingerprint-drift, source-range-foreign, owner-cross-revision:each is a distinct context failure,not downgraded confidence |
| IDENTITY | provider-renamed-key-stable, revision-rebound-key-stable, payload-changed-key:declared binding transformations only;unicode-key-order, integer-key-order, extraction-version-encoding:explicit IDENTITY_ENCODING_ONLY vectors |
| POLICY | policy-missing:valid raw and complete projection still explicitly blocked;no complete Syntax envelope or fabricated numeric policy |

- [ ] For every claimed Source span, record the exact source literal/slice and coordinate rationale from existing conventions. Check UTF8 byte versus UTF16 column behavior against existing raw examples; do not reinterpret coordinates to make a case pass. Identity-only/nonnative/schema cases never imply extractor performance.
- [ ] Author keyMeaning canonical text and framed/hash expectations using an independent standard-library identity recipe from the accepted annex. Preserve provider/revision exclusion and meaningful ARRAY/OBJECT order. The authoring script lives only in the evidence workspace and imports no oracle or product normalizer. It may serialize explicit literals, not mine expected values from new code.
- [ ] Format new semantic files, verify source copies against originals, then freeze before T2. provenance.json lists exact semantic payload files and their hashes (excluding its own self-hash and later loader code); sourceOrigins records source/role/copy hashes. semantic-freeze.json additionally pins provenance/README/manifest. Loader/oracle code is separately pinned in final evidence. Preserve all old701 current Fixture files; do not overwrite an old root.

**Completion:**34 case IDs/6 families, full reviewed literal assertions, no inferred numeric policy, immutable semantic freeze. Counts derive from the explicit coverage list, not an accuracy threshold. Raw author-review defects require a preserved old freeze and explicit corrected successor; no silent regeneration to match a test.

## Task T2 — Assertion-only offline oracle and minimal registrations

**Consumes:** T1 frozen semantic bytes. **Produces:** corpus loader, oracle and exact root/registry changes; no product implementation.

- [ ] Write named tests first: `manifest and provenance cover exact independent payloads`, `all nonnumeric projections obey declared field/ref semantics`, `unrepresentable value ambiguity refuses without callee upgrade`, `identity literals preserve provider independence and encoding`, `no numerical policy or Canonical envelope is manufactured`, `one root test and one Fixture registration`. Assert literal fields and invariants, not only snapshot hashes. Observe missing loader/API RED, then a callable incorrect loader/control RED before implementation; retain actual exits.
- [ ] Implement only the three corpus loader exports and assertion oracle. Validate raw observation/Source/ref and projected payload with existing strict schemas. Use existing SyntaxEvidence union member payload schemas directly, without constructing a full envelope using made-up confidence. Walk raw/projected values in paired assertions, checking scalar equality, array/OBJECT order, binding membership and expected disposition. This verifies fixture consistency, not a future normalizer or Runtime policy gate.
- [ ] Verify independently authored canonical key text/hash/framed expected values against Node crypto and existing identity primitives. Preserve existing helper encodings. Inject in-memory corruptions of source/ref/key/expected policy fields so the checker must catch them; never mutate frozen files during these controls.
- [ ] Append one new root test path and update exactly the three structural counters/titles described above. Keep all old test tokens byte-for-byte in the JSON string; retained ID/catalog assertions remain exact. Do not run the full root script.
- [ ] Run `node --test scripts/test-syntax-mapping-preparation.mjs scripts/test-history-transition.mjs scripts/test-delta-support-candidate.mjs scripts/test-r011-history-capture.mjs`. Expected:exit0,all executed cases pass,no skip; registry54/exact28/newID once/catalog0. Actual test counts must come from output,not this plan.

**Completion:** local offline oracle passes, semantic freeze unchanged, exact structural diffs and negative corruption controls proven. Not a claim that missing-policy rejection exists in product code or that any Native output was captured.

## Task T3 — Local preparation acceptance and documentation

- [ ] Verify the sealed predecessor hashes and every protected input. If compiled artifacts differ/miss, stop the affected test setup rather than silently rebuilding or installing dependencies. Use the unchanged existing libraries; no source/build/DB/native work is needed.
- [ ] Standalone M-01: run the exact15-file command in planned-local-commands.json and architecture command. Combined M-01/M-02: run T2 focused tests first, keep M-01 final acceptance pending, then run the16-file combined closure once after M-02. Do not duplicate whole15/16 batches merely for status.
- [ ] Check owned formatting, relative links, exact root suffix, three old-oracle substitutions, registry/provenance, old701 bytes and new semantic freeze. Review all Review Focus cases and raw failure logs. Record fresh actual counts/exit codes, not H1's historical1467 or any invented pass target.
- [ ] Update CURRENT_STATUS/traceability/authorities with only LOCAL_MAPPING_ORACLE_PREPARATION and its limitations. Preserve H1 acceptance; full normalizer/H2/H3/H4/H5 and Phase1 exits remain open. Seal final hashes and author implementation review; no Git changes.

## Execution handoff

The first executable action after explicit whole-package approval is copying the protected baseline and independently authoring T1, not creating a product mapping function. Approval requested for new Fixture data plus test-only loader/oracle and documentation;this is distinct from product coding and must be explicit. User's existing sequential execution method persists. Confidence values/calibration/actual Native/cloud remain separately confirmed even if this preparation package is approved.
