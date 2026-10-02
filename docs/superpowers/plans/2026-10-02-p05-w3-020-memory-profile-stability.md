# P05-W3-020-B Memory Profile Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task using the preserved native method. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an auditable high-water/range reservation candidate, preserve failed observations, and restore packet B acceptance only after exact numeric approval and fresh complete gates.

**Architecture:** Offline standard-library tools validate immutable Fixture evidence and calculate the accepted policy; Runtime still consumes an explicitly approved static reservation. The existing actual-path workers, publication transaction, corpus and peak comparisons stay unchanged. This resumes the existing packet B review correction, not a new phase or subsystem.

**Tech Stack:** Node24.15.0/Windows x64 for reviewed measurement, Node >=24 <25 for tooling, TypeScript/Zod and existing Rust tooling; no dependency, explicit GC or cloud service.

**Spec:** [Memory stability written amendment](../specs/2026-10-02-p05-w3-020-memory-profile-stability-proposal.md), accepted by the user's “确认” on2026-10-02. This plan itself awaits review. Numeric candidate approval remains separate.

## Global Constraints

- Preserve all AGENTS/Handoff/FROZEN/DEFERRED constraints, strict IPC caps, retained SQL charge and Phase0.5 count10/14. No REFRESH producer, query/CLI/Wiki/Knowledge or phase promotion.
- Preserve existing13 read/seal and14 transport classes and five fresh repetitions/class; workers/benchmarks, fixture density, units and expected outcomes remain unchanged.
- Eligible evidence matches exact Node/V8/platform/arch/Zod/implementation and workspace/corpus provenance. Never borrow an older build's reservation or combine different inputs as repetitions.
- Compute `M = max(group.high)`, `J = max(group.high-group.low)`, candidate `max(M+J, highest prior exact-identity approved reservation)`. Withdrawn approval is historical floor, not release permission. No inferred statistics/RSS bound, guessed margin, rounding or automatic reduction.
- Preserve all compatible known observations, including existing dense-site diagnostics. Raw reports, candidate reports and failed gate logs have distinct identities; never rewrite a raw report or synthesize a missing observation.
- Collect sequentially, freeze candidate inputs, then independently verify every class once. Holdout samples do not silently enter the frozen candidate. Failure holds readiness, never triggers retry-until-green or auto-tuning.
- The insufficient corrected-build profile is currently withdrawn. Do not install a fake profile or bypass production admission to run positive tests. Task3 stops for actual numeric review; Task4 requires explicit approval.
- Product hash excludes profile-data JS but includes other built IR/Storage/Providers/Runtime JS. Verify current hash after builds; new production behavior requires remeasurement/plan amendment.
- Existing pending source/CI/test corrections belong to the parent review pass. Preserve dirty work and `.pnpm-store`; no broad staging/reset/cleanup. Do not dispatch another reviewer of the previously reviewed branch automatically.
- Native implementation is preserved, but this new written plan must be reviewed before execution. No push/PR/merge authority is inferred.

## Review Focus

1. A manifest uses a symlink or `../` to an outside report: reject before reading unrestricted files (Task1).
2. A new low calibration batch omits a known compatible diagnostic high peak: reject incomplete listed history/provenance; preserve the historical high in the aggregate (Tasks1/3).
3. Same case name exists in both workspaces with different inputs: keep groups separate; do not inflate/shrink range by mixing them (Task1).
4. A worker exits nonzero, emits invalid JSON or exceeds reservation: persist safe raw outcome evidence and keep the command/job failing (Task2).
5. A holdout exceeds the frozen candidate: retain it as failed verification, do not regenerate/approve a candidate behind the user's back (Tasks2/3).

---

## Files and shared contracts

Create `scripts/native-memory-profile.mjs` (offline provenance/formula/CLI), `scripts/test-native-memory-profile.mjs` (pure/file/CLI tests), `scripts/native-memory-observations.mjs` (sequential collection/CLI) and `scripts/test-native-memory-observations.mjs` (collector process-boundary tests). Extend existing `scripts/native-memory-gate.mjs` only to preserve observations around the unchanged comparison. Create an evidence manifest/candidate/holdout in the existing `fixtures/storage/native-analysis-state/` directory; do not create a parallel Handoff or alter existing raw reports.

Modify root `package.json` to register the two new nonbinary suites and the required memory collection entry, `.github/workflows/ci.yml` for failure-inclusive artifact capture, `.gitattributes` for exact raw-evidence bytes, profile data/type and existing provenance tests only when their task requires it. Synchronize existing Handoff spec/status/authority/acceptance/traceability/Evaluation and the parent plan's actual execution record.

Manifest schemaVersion1 fields: `policyRevision`, `environment`, `corpora` keyed READ_SEAL/FULL_TRANSPORT (`revision`,`digest`), `requiredCases` keyed workspace, `reports`, `priorApprovals`. Report entry fields: `path` relative to fixtureRoot, `sha256`, `workspace`, `purpose` (calibration/diagnostic/verification), `command`, `collectionConditions`; diagnostic entries additionally declare `caseName`,`corpusPayloadDigest`,`parentCalibrationSha256`. Prior approval fields: exact `environment`, `reservationBytes`, `status` (approved/withdrawn), `approvalReference`. Fixture-local report paths resolve through realpath; evidence outside fixtureRoot is rejected. Validate exact keys/shapes and only restricted environment tuples.

Candidate schemaVersion1 fields: `status:PROVISIONAL_REVIEW_REQUIRED`, `policyRevision:p05-native-memory-high-water-range-v1`, `environment`, `corpora`, `manifestDigest`, `reportDigests`, `groups` (`key`,`workspace`,`caseName`,`inputIdentity`,`count`,`low`,`high`,`range`), `observedPeakBytes`,`fluctuationAllowanceBytes`,`priorApprovalFloorBytes` (null if absent), `reservationBytes`. Group order and report digest order are sorted for deterministic output. Preserve existing raw-report byte hashes in separate profile fields.

## Task1: Offline provenance and reproducible candidate

**Files:** Create profile tool/test above; register test in root script; create a synthetic temporary-file test helper within that test file only. Do not create a production candidate/profile yet.

**Interfaces:** Export `calculateNativeMemoryReservation(groups, previousApprovedBytes = null)` returning `{observedPeakBytes,fluctuationAllowanceBytes,priorApprovalFloorBytes,reservationBytes}`; each group input is `{key,low,high}` positive safe-integer bytes. Export async `buildNativeMemoryCandidate(manifestPath, fixtureRoot)` returning the candidate contract above. CLI: `node scripts/native-memory-profile.mjs candidate <manifestPath> <fixtureRoot>` emits JSON to stdout or fails nonzero without disclosing raw unrestricted paths/content. No output-writing side effects in candidate generation.

- [ ] Write `preserves high water and one measured range`, `keeps prior approval floor`, `rejects overflow/invalid groups`, and `separates workspace/input groups`. Hand-derived assertions:
  ```js
  assert.deepEqual(
    calculateNativeMemoryReservation([
      { key: 'READ_SEAL:a:input-a', low: 80, high: 100 },
      { key: 'FULL_TRANSPORT:a:corpus-b', low: 130, high: 150 },
    ]),
    {
      observedPeakBytes: 150,
      fluctuationAllowanceBytes: 20,
      priorApprovalFloorBytes: null,
      reservationBytes: 170,
    },
  );
  assert.equal(
    calculateNativeMemoryReservation([{ key: 'x', low: 80, high: 100 }], 200).reservationBytes,
    200,
  );
  assert.throws(() =>
    calculateNativeMemoryReservation([{ key: 'x', low: 1, high: Number.MAX_SAFE_INTEGER }]),
  );
  ```
  Synthetic numeric examples are test arithmetic, never new product thresholds. Add file/CLI cases for raw-hash mismatch, symlink/traversal escape, absent report, incompatible identity, invalid units, invalid expected outcome, missing class/five-repeat coverage, diagnostic without parent/payload association, duplicated report and preservation of earlier high samples.
- [ ] Run `node --test scripts/test-native-memory-profile.mjs`; expect RED for missing functions/CLI, then actual behavioral assertions. Never count import failure as the final regression proof.
- [ ] Implement the two functions/CLI with stdlib. Recompute existing corpus digests using their current pinned file order. Verify calibration report cases against the current imported class lists and five repetitions; for read/seal require persistent-state/transaction flags and known read/seal outcomes, for transport require expected outcome/peak method/overlap. Match existing helper expectations rather than treating negative Fixtures as failed calibration. A diagnostic parent must be an eligible matching calibration and payload group. Candidate computation ignores purpose=verification; reject use of verification as calibration. Prior approval must match exact identity and a human approval reference, not arbitrary unverified floor input in the real manifest.
- [ ] Rerun file/CLI/pure tests; expected all pass, unchanged existing raw hashes and no product build/profile mutation. Add new suite to root script with focused patch; run root tests and report the currently expected unreviewed exact-profile assertions separately, not as a completed green parent gate.
- [ ] Commit only Task1 tooling/tests/registration and honest status; not the remaining parent review correction. Suggested message: `feat(evaluation): derive native memory candidate from immutable evidence`.

## Task2: Failure-inclusive observations and unchanged mandatory gate

**Files:** Create observation tool/test, extend memory-gate helper, update corpus tests' artifact recording, root scripts, CI and relevant Evaluation/trace/status.

**Interfaces:** Export async `collectNativeMemoryObservations({mode,candidatePath,outputDirectory}, runWorker = runPinnedMemoryWorker)`; mode is `candidate` (offline comparison with frozen candidate) or `approved` (existing exact-profile gate). The library-only test seam `runWorker(workspace,caseName)` returns `Promise<{exitCode,stdout,stderr}>`; default uses only the fixed pinned workers, and CLI exposes no alternate worker path. Return `{passed,observations,failures}` and persist `outputDirectory/observations.json`; CLI `node scripts/native-memory-observations.mjs <candidate|approved> <outputDirectory> [candidatePath]` exits0 only if every required class collected and passes. Both modes use the same fixed workspace/worker/class mapping; run27 classes sequentially in fresh Node processes. No product callers and no worker/corpus modifications. Existing `checkNativeMemoryObservation(observation,profiles,requireProfile)` retains exact reservation equality/excess semantics.

- [ ] Write process-boundary tests `failure still creates an observation artifact`, `missing profile fails required mode`, `frozen candidate rejects holdout excess`, `collector failure cannot become successful exit`, `invalid child JSON/nonzero exit captured safely`, plus equality/one-byte-above. Use a test-only fake worker at the subprocess boundary, not fake profile installation or dummy publication code; keep production class mappings fixed. Collector's internal subprocess seam may be injected by the test API, not exposed as a user-configurable CLI capability.
- [ ] Run `node --test scripts/test-native-memory-observations.mjs`; expected missing collector RED, then verify artifact/exit assertions fail before implementing their behavior.
- [ ] Implement sequential collector using stdlib and the existing workers. Preserve complete schema-validated JSON observations and restricted failure metadata (exit status, known failure code, class, environment when available); do not dump arbitrary invalid child output/stderr or the full environment. Persist artifact before peak comparison; aggregate failures and exit nonzero after collecting available cases. Raw aggregate is schemaVersion1 with `purpose:verification`, environment/corpora, observations and failures. No write into existing measurement reports. Candidate mode validates candidate provenance and exact current built environment, compares every peak to the frozen candidate and never modifies it. Approved mode retains required-profile fail-closed behavior.
- [ ] Have both existing corpus tests record valid worker observations before invoking their unchanged peak gate, using `CODEATLAS_NATIVE_MEMORY_ARTIFACT_DIR` when supplied. Each test process writes its own workspace/PID artifact, avoiding concurrent overwrite; failure retains the artifact. Root unsupported-platform tests still report no admission; Windows required collection forces exact profile availability.
- [ ] Add root `test:native-memory` invoking approved collector, reached by `pnpm verify` and Windows native CI; keep both original corpus suites in required coverage. Run memory step with `if: always()` after builds, so prior failure cannot silently prevent evidence collection; missing build/profile produces explicit failure artifacts, not a skip. Upload only the designated memory artifact directory using `actions/upload-artifact@v4` with `if: always()`. Mark unavailable hosted evidence unavailable, not passing.
- [ ] Run both new tooling suites, existing gate boundary tests and required collector failure tests. Expected artifact exists and exit1 on deliberately invalid/unreviewed cases, all tooling assertions pass. Record current actual-profile readiness remains red; commit Task2 tooling/CI wiring only, not a completed parent packet.

## Task3: Complete calibration, immutable manifest and independent candidate verification

**Files:** Add `fixtures/storage/native-analysis-state/memory-stability-evidence.json`, new paired raw reports, `memory-stability-candidate.json`, `memory-stability-holdout.json` and `.gitattributes` exact-byte entries; synchronize design/status/evidence references.

**Consumes:** Task1 `buildNativeMemoryCandidate` and candidate contract; Task2 candidate collector. Initial manifest includes existing review-fix paired65/70 reports, bound five-observation diagnostic file, and new full paired calibration for the actual build. Known failed gate log stays failure evidence but not a fabricated raw row. Include the withdrawn212,692,992-byte exact-identity approval as historical floor with CURRENT_STATUS approval reference; do not borrow other-build approvals.

- [ ] Verify forced builds/current Node/V8/Zod/platform/corpus hashes. Read the actual current built identity. Do not assume it remains `86fa33...`; stop if this unexpectedly changes measured paths and amend/recalibrate rather than forging a manifest match.
- [ ] Run sequentially `node scripts/bench-native-metadata-memory.mjs` and `node scripts/bench-native-full-v3-memory.mjs`, capturing unmodified stdout as new raw evidence. Expected65 and70 observations, unchanged corpus identities, same exact environment, required class/outcome/transaction checks. A collection failure stops readiness; retain its evidence. Never run heavy gates concurrently during collection.
- [ ] Author/freeze the manifest with actual SHA-256 values and approved-field contracts, without changing old reports. Run `node scripts/native-memory-profile.mjs candidate fixtures/storage/native-analysis-state/memory-stability-evidence.json fixtures/storage/native-analysis-state`; capture exact JSON as candidate. Expected deterministic recomputation, full compatible history included, no verification rows eligible, all prior raw hashes unchanged. Report M/J/floor/reservation and their determining observations; do not install the value.
- [ ] Run `node scripts/native-memory-observations.mjs candidate <plan-artifact-directory> fixtures/storage/native-analysis-state/memory-stability-candidate.json`. Pin the completed raw holdout artifact unchanged as `memory-stability-holdout.json` after validating its hash and class coverage. Expected27 fresh exact-identity observations, all peaks <= frozen candidate and all correctness checks pass. If any exceedance occurs, retain the frozen candidate and failed holdout and stop for review; no regenerated candidate or repeated attempt in this task.
- [ ] Run candidate/provenance test suites and verify exact raw/candidate/manifest/holdout digests, formatting/relative links. Commit Task3 evidence/documents only after a passing independent comparison, or clearly record a failed evidence hold without claiming completion. Suggested message: `test(evaluation): pin native memory stability candidate and holdout`.
- [ ] **STOP for explicit numeric review:** present exact reservation bytes + unchanged twice-retained-SQL charge, matching identity, M/J/floor, report hashes, complete holdout result and limitations. This plan approval is not numeric approval. Await user decision before Task4.

## Task4: Approved profile provenance and final consolidated review acceptance

**Files:** Extend `packages/runtime/src/native-metadata-profiles.ts` with optional `memoryPolicyRevision`, `memoryCandidateEvidenceDigest`, `observedPeakBytes`, `fluctuationAllowanceBytes`; add the explicitly approved profile data. Update Runtime admission/read provenance tests for the new policy; retain every historical entry. Commit parent pending Provider/Runtime/tests/CI corrections only after complete verification.

**Consumes:** Task3 exact approved candidate/holdout, both raw report digests and unchanged corpus identities. Profile reservation is the user-approved exact candidate, never a plan literal. Existing `evidenceDigest`/transport evidence fields reference the new raw paired calibration; candidate digest references the distinct aggregate report.

- [ ] Write provenance tests against the approved candidate report and exact current identity; validate manifest/report/raw/holdout hashes and the formula independently. Update required supported-build and exact-budget boundary assertions to the reviewed value. Run before installation: expected RED for absent exact profile, not arbitrary replacements in test-only product copies.
- [ ] Add approved data/optional metadata fields only; do not change Runtime admission algorithm or historical entries. Run `node node_modules/typescript/bin/tsc -b packages/runtime --force`; expected no errors and unchanged measured identity (profile JS excluded). If identity changes, stop and repeat governed actual-build measurement before installation claims.
- [ ] Run Runtime admission/read/bootstrap tests plus original three preflight regressions and both fresh memory suites with required profile flag. Expected every assertion passes; fresh excess still fails and artifact remains. Candidate-policy tests compare computed reservation with M+J/floor, not raw maximum; historical-profile test meaning is unchanged.
- [ ] Run `pnpm verify`, dedicated required memory collector, `cargo fmt --all --check`, build/Clippy/workspace tests and all real native scripts. If no-TTY pnpm installation restriction repeats, preserve actual error and execute every equivalent root/type/build/architecture/format/native/Rust command; do not mark wrapper passed. Require fresh root0fail with existing skip disclosed, real native/bootstrap green, architecture17 and immutable R010 checksum. No cherry-picking a later memory pass after any exceedance.
- [ ] Update parent Task7 checkboxes/completion evidence only now, retain Phase0.5 count10/14 and original REFRESH/phase exits. Record the original single review's two Important findings and TDD RED→GREEN evidence plus final green suite; no re-review of that branch is automatically dispatched. Scoped commit of the completed parent repair/profile/tooling evidence: `fix(native): enforce bounded bootstrap and reviewed memory gates`.
- [ ] Stop at integration handoff. No push/PR/merge from this plan or numeric approval alone. A later authorized hosted run/merge must verify exact commit CI and memory artifacts; no local gate claims hosted success.

## Dependencies and plan self-review

## Execution record (2026-10-02)

User “确认” approved this plan and retained native inline execution. Tooling checkpoints3815848/cf8b4fc implement Tasks1/2; shared root registration landed inTask2 after a scoped index-only patch failed. Their overall full-suite completion remains open for Task4: root837 total/833pass/3 profile-related failures/1existing skip; no suppressions. Actual required approved collection saves27 observations and exits1 with27 missing-profile refusals. Latest tooling/provenance suites37/37 include behavioral RED→GREEN for omitted/reordered history, changed calibration/holdout input, wrong class and restricted artifacts.

Task3 calibration and review preparation executed: forced Runtime build preserves86fa33c5 identity; new unchanged65/70 raw reports join previous65/70 plus5diagnostics, totaling275. Frozen manifest/candidate/holdout hashes and commands are in CURRENT_STATUS. Candidate M245,719,040+J34,734,080=280,453,120, above withdrawn prior floor212,692,992; independent27-class holdout passes once with max213,184,512. After adding a holdout input check, existing raw samples were audited against the strengthened rule without recollection. Scratch audit import-path failure was corrected with both logs retained. Exact-byte attributes preserve all reports. **Task4 is not started: separate approval of280,453,120 bytes plus twice retained SQL UTF-8 is required.** No current profile/packet acceptance/hosted result or external publication is claimed. Original checklist completion is not asserted merely by tooling checkpoint commits.

Sequence1→2→3→numeric approval→4. Shared interfaces: Task1 candidate/report contract feeds Task2 comparison; Task2 raw holdout feeds Task3 audit; Task3 approved reservation/digests feed Task4 profile. Measurement remains sequential. Parent review ledger is retained; create only this approved amendment plan's execution ledger, cross-reference parent correction status without redoing committed parent tasks.

Preapproval commits are tooling/evidence checkpoints, not green parent acceptance or claims that known failing root gates are complete. Keep Task1/2 overall completion open if their full-suite verification is blocked by the recorded current-profile hold; their independently verified tooling interfaces may feed the measurement preparation. Close completion records only after Task4's full green gate. Record every actual failure by name; no fabricated success or suppressed suite run.

Spec coverage: identity/provenance/formula→1; capture/CI failure→2; calibration/independence→3; exact approval/Runtime/final gates→4. Review Focus items each have owning tests. Paths and function names are consistent; no worker change, extra repetition count, concrete new reservation, dependency or deferred capability is prescribed. Temporary red current-build parent gates are explicit, never called Task4 completion. Read-only planning introduces no implementation-ready claim until user review of this plan. Preserve native execution method; request plan confirmation, not another execution-method choice.
